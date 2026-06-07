import type {
  BreadcrumbItem,
  ElementPath,
  OutlineNode,
  SelectionInfo,
} from "./types"
import { savedMediaSrc } from "./mediaPreview"
import { imageAnnotationWrapper } from "./imageAnnotation"
import { readStyleState } from "./styleProps"

/** 編集ツールが注入した要素を示す属性。保存時に必ず除去する */
export const EDITOR_INJECTED_ATTR = "data-spec-editor-injected"
/** ユーザーが設定した要素ロック。保存対象として HTML に残す */
export const ELEMENT_LOCKED_ATTR = "data-he-locked"
/** 編集対象から除外する属性(保存時クリーンアップ対象) */
export const EDITOR_TEMP_ATTRS = ["contenteditable", "spellcheck", "tabindex"]

const VOID_OR_INLINE_SKIP = new Set([
  "script",
  "style",
  "link",
  "meta",
  "head",
  "title",
])

const TEXT_EDITABLE_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "td",
  "th",
  "a",
  "span",
  "strong",
  "em",
  "b",
  "i",
  "label",
  "caption",
  "figcaption",
  "blockquote",
  "button",
  "summary",
  "dt",
  "dd",
])

/** body を起点とした子インデックス列で要素位置を一意に表現する */
export function getElementPath(el: Element, body: HTMLElement): ElementPath {
  const path: number[] = []
  let current: Element | null = el
  while (current && current !== body) {
    const parent: Element | null = current.parentElement
    if (!parent) break
    const index = Array.prototype.indexOf.call(parent.children, current)
    path.unshift(index)
    current = parent
  }
  return path
}

/** パスから要素を解決する。見つからなければ null */
export function resolveElementPath(
  path: ElementPath,
  body: HTMLElement
): Element | null {
  let current: Element = body
  for (const index of path) {
    const next = current.children[index]
    if (!next) return null
    current = next
  }
  return current === body ? null : current
}

function describeElement(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const id = el.getAttribute("id")
  if (id) return `${tag}#${id}`
  const cls = (el.getAttribute("class") || "").trim().split(/\s+/)[0]
  if (cls) return `${tag}.${cls}`
  return tag
}

function textPreview(text: string): string {
  text = text.replace(/\s+/g, " ").trim()
  if (text.length <= 40) return text
  return text.slice(0, 40) + "…"
}

function textPreviewOf(el: Element): string {
  const clone = el.cloneNode(true) as Element
  clone.querySelectorAll(".he-image-annotation-svg").forEach((svg) => svg.remove())
  return textPreview(clone.textContent || "")
}

function directTextPreviewOf(el: Element): string {
  return textPreview(
    Array.from(el.childNodes)
      .filter((node) => node.nodeType === 3)
      .map((node) => node.textContent || "")
      .join(" ")
  )
}

function gridColumnCountOf(el: Element): number | null {
  const grid = el.closest(".he-grid") as HTMLElement | null
  if (!grid) return null
  const raw = grid.style.getPropertyValue("--he-grid-col-count").trim()
  const count = raw ? Number(raw) : 2
  return Number.isFinite(count) ? count : 2
}

export function hasOwnElementLock(el: Element): boolean {
  return el.hasAttribute(ELEMENT_LOCKED_ATTR)
}

export function isElementLocked(el: Element): boolean {
  return !!el.closest(`[${ELEMENT_LOCKED_ATTR}]`)
}

export function isLockedByAncestor(el: Element, body: HTMLElement): boolean {
  let current = el.parentElement
  while (current && current !== body) {
    if (hasOwnElementLock(current)) return true
    current = current.parentElement
  }
  return false
}

export function hasLockedDescendant(el: Element): boolean {
  return !!el.querySelector(`[${ELEMENT_LOCKED_ATTR}]`)
}

export function buildSelectionInfo(
  el: Element,
  body: HTMLElement
): SelectionInfo {
  const path = getElementPath(el, body)
  const tagName = el.tagName.toLowerCase()
  const breadcrumb: BreadcrumbItem[] = []
  let current: Element | null = el
  while (current && current !== body) {
    breadcrumb.unshift({
      label: describeElement(current),
      path: getElementPath(current, body),
    })
    current = current.parentElement
  }
  breadcrumb.unshift({ label: "body", path: [] })

  const attributes: Record<string, string> = {}
  for (const name of el.getAttributeNames()) {
    attributes[name] = el.getAttribute(name) ?? ""
  }
  if (tagName === "img" || tagName === "video" || tagName === "audio") {
    attributes.src = savedMediaSrc(el)
  }

  const detailsEl = el.closest("details")
  const annotationWrapper = imageAnnotationWrapper(el)
  const isSelfLocked = hasOwnElementLock(el)
  const lockedByAncestor = isLockedByAncestor(el, body)

  return {
    path,
    tagName,
    id: el.getAttribute("id"),
    className: el.getAttribute("class"),
    textPreview: textPreviewOf(el),
    isImage: tagName === "img",
    imageDisplayWidth:
      tagName === "img"
        ? (
            annotationWrapper?.style.getPropertyValue("width") ||
            (el as HTMLElement).style.getPropertyValue("width")
          ).trim()
        : null,
    isVideo: tagName === "video",
    isAudio: tagName === "audio",
    isTextEditable: TEXT_EDITABLE_TAGS.has(tagName),
    isLocked: isSelfLocked || lockedByAncestor,
    isSelfLocked,
    isLockedByAncestor: lockedByAncestor,
    isInTable: !!el.closest("table"),
    detailsOpen: detailsEl ? detailsEl.hasAttribute("open") : null,
    isInColumns: !!el.closest(".he-cols"),
    isInGrid: !!el.closest(".he-grid"),
    gridColumnCount: gridColumnCountOf(el),
    attributes,
    styleState: readStyleState(el),
    breadcrumb,
  }
}

/** body 配下の DOM からアウトラインツリーを構築する */
export function buildOutline(body: HTMLElement, maxDepth = 6): OutlineNode[] {
  function walk(el: Element, depth: number): OutlineNode | null {
    const tag = el.tagName.toLowerCase()
    if (VOID_OR_INLINE_SKIP.has(tag)) return null
    if (el.classList.contains("he-image-annotation-svg")) return null
    const path = getElementPath(el, body)
    const preview = textPreviewOf(el)
    const label = preview
      ? `${describeElement(el)} — ${preview}`
      : describeElement(el)
    const children: OutlineNode[] = []
    if (depth < maxDepth) {
      for (const child of Array.from(el.children)) {
        const node = walk(child, depth + 1)
        if (node) children.push(node)
      }
    }
    return {
      path,
      tagName: tag,
      label,
      textPreview: preview,
      directTextPreview: directTextPreviewOf(el),
      isLocked: isElementLocked(el),
      children,
    }
  }

  const roots: OutlineNode[] = []
  for (const child of Array.from(body.children)) {
    const node = walk(child, 0)
    if (node) roots.push(node)
  }
  return roots
}
