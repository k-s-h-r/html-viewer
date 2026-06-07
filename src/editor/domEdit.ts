export const FORMAT_TAG: Record<"bold" | "italic" | "underline", string> = {
  bold: "strong",
  italic: "em",
  underline: "u",
}

export function wrapRangeWithTag(
  doc: Document,
  range: Range,
  tag: string,
  attrs?: Record<string, string>
): HTMLElement {
  const wrapper = doc.createElement(tag)
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) wrapper.setAttribute(k, v)
  }
  wrapper.appendChild(range.extractContents())
  range.insertNode(wrapper)
  return wrapper
}

export function unwrapElement(el: Element) {
  const parent = el.parentNode
  if (!parent) return
  while (el.firstChild) parent.insertBefore(el.firstChild, el)
  parent.removeChild(el)
}
