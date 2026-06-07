/** ソースモード表示用 HTML に一時挿入するスクロール位置マーカー */
export const SOURCE_SCROLL_ANCHOR_TEXT = "__spec-editor-scroll-anchor__"
export const SOURCE_SCROLL_ANCHOR_HTML = `<!--${SOURCE_SCROLL_ANCHOR_TEXT}-->`

export function stripSourceScrollAnchor(html: string): {
  html: string
  scrollOffset: number | null
} {
  const idx = html.indexOf(SOURCE_SCROLL_ANCHOR_HTML)
  if (idx < 0) return { html, scrollOffset: null }
  return {
    html: html.replace(SOURCE_SCROLL_ANCHOR_HTML, ""),
    scrollOffset: idx,
  }
}

/** textarea の文字オフセット付近へスクロールし、キャレットを置く */
export function scrollTextareaToOffset(
  textarea: HTMLTextAreaElement,
  offset: number
): void {
  const safe = Math.max(0, Math.min(offset, textarea.value.length))
  textarea.focus()
  textarea.setSelectionRange(safe, safe)

  const textBefore = textarea.value.slice(0, safe)
  const lineIndex = textBefore.split("\n").length - 1
  const style = getComputedStyle(textarea)
  const lineHeight =
    parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4 || 20
  const paddingTop = parseFloat(style.paddingTop) || 0
  const targetTop = paddingTop + lineIndex * lineHeight - textarea.clientHeight / 3
  textarea.scrollTop = Math.max(0, targetTop)
}
