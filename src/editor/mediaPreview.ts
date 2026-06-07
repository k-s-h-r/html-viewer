import {
  MEDIA_PLACEHOLDER_PATH,
  MEDIA_PLACEHOLDER_SVG,
  isPlaceholderMediaPath,
} from "./mediaPlaceholder"

/** 保存用の相対パス。iframe 内の src はプレビュー用 blob URL を指すことがある */
export const EDITOR_MEDIA_SRC_ATTR = "data-spec-media-src"

const blobByRelativePath = new Map<string, string>()

export function clearMediaPreviewRegistry(): void {
  for (const url of blobByRelativePath.values()) {
    URL.revokeObjectURL(url)
  }
  blobByRelativePath.clear()
}

export function registerMediaPreview(relativePath: string, file: File): string {
  const prev = blobByRelativePath.get(relativePath)
  if (prev) URL.revokeObjectURL(prev)
  const blobUrl = URL.createObjectURL(file)
  blobByRelativePath.set(relativePath, blobUrl)
  return blobUrl
}

export function previewUrlForRelativePath(relativePath: string): string | null {
  return blobByRelativePath.get(relativePath) ?? null
}

function isRelativeMediaPath(src: string): boolean {
  return (
    !src.startsWith("blob:") &&
    !src.startsWith("data:") &&
    !/^[a-z][a-z0-9+.-]*:/i.test(src)
  )
}

/** 保存 HTML 用に相対パスへ戻す（シリアライズ前に呼ぶ） */
export function restoreMediaSrcForSave(root: Element): void {
  root.querySelectorAll("img, video, audio").forEach((el) => {
    const stored = el.getAttribute(EDITOR_MEDIA_SRC_ATTR)
    if (stored) {
      el.setAttribute("src", stored)
      el.removeAttribute(EDITOR_MEDIA_SRC_ATTR)
      return
    }
    const src = el.getAttribute("src") ?? ""
    if (src.startsWith("blob:") || src === MEDIA_PLACEHOLDER_SVG) {
      if (!stored) el.setAttribute("src", MEDIA_PLACEHOLDER_PATH)
      else el.setAttribute("src", stored)
    }
  })
}

function applyPlaceholderImagePreview(el: Element, storedPath: string): void {
  el.setAttribute(EDITOR_MEDIA_SRC_ATTR, storedPath)
  el.setAttribute("src", MEDIA_PLACEHOLDER_SVG)
}

/** エディタ内プレビュー: 相対パスを blob URL に差し替える */
export function applyMediaPreview(el: Element): void {
  const tag = el.tagName.toLowerCase()
  if (tag !== "img" && tag !== "video" && tag !== "audio") return

  let stored = el.getAttribute(EDITOR_MEDIA_SRC_ATTR)
  const currentSrc = el.getAttribute("src") ?? ""

  if (!stored && isRelativeMediaPath(currentSrc)) {
    stored = currentSrc
  }

  if (tag === "img" && isPlaceholderMediaPath(stored ?? currentSrc)) {
    applyPlaceholderImagePreview(el, MEDIA_PLACEHOLDER_PATH)
    return
  }

  if (!stored) return

  const preview = previewUrlForRelativePath(stored)
  if (preview) {
    // blob プレビューに差し替える際、保存用の相対パスを必ず保持する
    el.setAttribute(EDITOR_MEDIA_SRC_ATTR, stored)
    el.setAttribute("src", preview)
  }
}

export function applyMediaPreviewToBody(body: HTMLElement): void {
  body.querySelectorAll("img, video, audio").forEach(applyMediaPreview)
}

/** ファイル選択後: 相対パスを保持しつつプレビュー表示 */
export function setMediaSourceWithPreview(
  el: Element,
  relativePath: string,
  file: File
): void {
  const preview = registerMediaPreview(relativePath, file)
  el.setAttribute(EDITOR_MEDIA_SRC_ATTR, relativePath)
  el.setAttribute("src", preview)
}

/** Inspector 表示用: 保存される src（相対パス） */
export function savedMediaSrc(el: Element): string {
  return el.getAttribute(EDITOR_MEDIA_SRC_ATTR) ?? el.getAttribute("src") ?? ""
}
