/** クリックで選択すべき要素を解決する（動画コントロール内クリック → 親 video/audio など） */
export function resolveSelectTarget(
  target: Element | null,
  body: HTMLElement
): Element | null {
  if (!target) return null
  const docEl = body.ownerDocument?.documentElement
  if (target === body || target === docEl) return null

  const media = target.closest("video, audio, img")
  if (media && media !== body) return media

  return target
}
