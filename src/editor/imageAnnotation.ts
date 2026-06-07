export const IMAGE_ANNOTATION_CLASS = "he-image-annotation"
export const IMAGE_ANNOTATION_SVG_CLASS = "he-image-annotation-svg"

export interface ImageAnnotationSnapshot {
  imageUrl: string
  width: number
  height: number
  svg: string
}

function positiveDimension(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function svgDimensions(svg: SVGSVGElement | null): {
  width: number
  height: number
} | null {
  if (!svg) return null
  const viewBox = svg.getAttribute("viewBox")?.trim().split(/[,\s]+/).map(Number)
  if (
    viewBox?.length === 4 &&
    Number.isFinite(viewBox[2]) &&
    viewBox[2] > 0 &&
    Number.isFinite(viewBox[3]) &&
    viewBox[3] > 0
  ) {
    return { width: viewBox[2], height: viewBox[3] }
  }
  const width = Number.parseFloat(svg.getAttribute("width") ?? "")
  const height = Number.parseFloat(svg.getAttribute("height") ?? "")
  if (width > 0 && height > 0) return { width, height }
  return null
}

export function annotationSvgForImage(
  image: HTMLImageElement
): SVGSVGElement | null {
  const wrapper = imageAnnotationWrapper(image)
  if (!wrapper) return null
  return wrapper.querySelector(
    `:scope > svg.${IMAGE_ANNOTATION_SVG_CLASS}`
  ) as SVGSVGElement | null
}

export function imageAnnotationWrapper(image: Element): HTMLElement | null {
  const wrapper = image.parentElement
  return image.tagName.toLowerCase() === "img" &&
    wrapper?.classList.contains(IMAGE_ANNOTATION_CLASS)
    ? (wrapper as HTMLElement)
    : null
}

export function imageInAnnotationWrapper(wrapper: Element): Element | null {
  if (!wrapper.classList.contains(IMAGE_ANNOTATION_CLASS)) return null
  return wrapper.querySelector(":scope > img")
}

export function emptyAnnotationSvg(width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"></svg>`
}

export function imageAnnotationSnapshot(
  image: HTMLImageElement
): ImageAnnotationSnapshot {
  const annotation = annotationSvgForImage(image)
  const existingDimensions = svgDimensions(annotation)
  const rect = image.getBoundingClientRect()
  const width = positiveDimension(
    existingDimensions?.width ?? image.naturalWidth,
    positiveDimension(rect.width, 640)
  )
  const height = positiveDimension(
    existingDimensions?.height ?? image.naturalHeight,
    positiveDimension(rect.height, 480)
  )

  const editableAnnotation = annotation?.cloneNode(true) as SVGSVGElement | null
  if (editableAnnotation) {
    cleanSvgEditArtifacts(editableAnnotation)
    editableAnnotation.classList.remove(IMAGE_ANNOTATION_SVG_CLASS)
    editableAnnotation.removeAttribute("aria-hidden")
    editableAnnotation.removeAttribute("focusable")
  }

  return {
    imageUrl: image.currentSrc || image.src,
    width,
    height,
    svg: editableAnnotation?.outerHTML ?? emptyAnnotationSvg(width, height),
  }
}

function parseAnnotationSvg(
  doc: Document,
  svgText: string
): SVGSVGElement | null {
  const parsed = new DOMParser().parseFromString(svgText, "image/svg+xml")
  if (parsed.querySelector("parsererror")) return null
  const source = parsed.documentElement
  if (source.localName !== "svg") return null
  return doc.importNode(source, true) as unknown as SVGSVGElement
}

function normalizeAnnotationSvg(
  svg: SVGSVGElement,
  width: number,
  height: number
): void {
  cleanSvgEditArtifacts(svg)
  svg.removeAttribute("id")
  svg.removeAttribute("x")
  svg.removeAttribute("y")
  svg.removeAttribute("overflow")
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`)
  svg.setAttribute("preserveAspectRatio", "none")
  svg.setAttribute("aria-hidden", "true")
  svg.setAttribute("focusable", "false")
  svg.classList.add(IMAGE_ANNOTATION_SVG_CLASS)
  for (const node of Array.from(svg.childNodes)) {
    if (
      node.nodeType === Node.COMMENT_NODE &&
      node.textContent?.includes("Created with SVG-edit")
    ) {
      node.remove()
    }
  }
}

function cleanSvgEditArtifacts(svg: SVGSVGElement): void {
  for (const animate of Array.from(svg.querySelectorAll("animate"))) {
    const parent = animate.parentElement
    if (parent && animate.getAttribute("attributeName") === "opacity") {
      const targetOpacity = animate.getAttribute("to")
      if (!targetOpacity || targetOpacity === "1") parent.removeAttribute("opacity")
      else parent.setAttribute("opacity", targetOpacity)
    }
    animate.remove()
  }
  for (const title of Array.from(svg.querySelectorAll("title"))) {
    if (title.textContent?.trim() === "Layer 1") title.remove()
  }
  for (const group of Array.from(svg.querySelectorAll("g.layer"))) {
    const attrs = group.getAttributeNames()
    const onlyLayerAttrs = attrs.every(
      (name) =>
        (name === "class" && group.classList.length === 1) ||
        (name === "id" &&
          /^(svg_\d+|Layer_\d+|layer_\d+)$/i.test(group.getAttribute(name) ?? ""))
    )
    if (!onlyLayerAttrs || !group.parentNode) continue
    group.replaceWith(...Array.from(group.childNodes))
  }
}

export function applyImageAnnotation(
  image: HTMLImageElement,
  svgText: string,
  width: number,
  height: number
): boolean {
  const doc = image.ownerDocument
  const svg = parseAnnotationSvg(doc, svgText)
  if (!svg) return false
  normalizeAnnotationSvg(svg, width, height)

  let wrapper = imageAnnotationWrapper(image)
  if (!wrapper) {
    wrapper = doc.createElement("div")
    wrapper.className = IMAGE_ANNOTATION_CLASS
    const imageWidth = image.style.getPropertyValue("width").trim()
    if (imageWidth) {
      wrapper.style.setProperty("width", imageWidth)
      image.style.setProperty("width", "100%")
    }
    image.replaceWith(wrapper)
    wrapper.appendChild(image)
  }

  annotationSvgForImage(image)?.remove()
  wrapper.appendChild(svg)
  return true
}
