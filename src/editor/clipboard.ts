/** アプリ内クリップボード(システム API が使えない場合のフォールバック) */
let appClipboardHtml: string | null = null

export function getAppClipboard(): string | null {
  return appClipboardHtml
}

export function setAppClipboard(html: string): void {
  appClipboardHtml = html
}

export function clearAppClipboard(): void {
  appClipboardHtml = null
}

export function hasAppClipboard(): boolean {
  return appClipboardHtml !== null
}

/** HTML 文字列から貼り付け可能なルート要素を取り出す */
export function parseHtmlFragment(doc: Document, html: string): Element | null {
  const trimmed = html.trim()
  if (!trimmed) return null

  if (/^<html[\s>]/i.test(trimmed) || /^<body[\s>]/i.test(trimmed)) {
    const parsed = new DOMParser().parseFromString(trimmed, "text/html")
    const body = parsed.body
    if (body.firstElementChild) {
      return body.firstElementChild.cloneNode(true) as Element
    }
    const text = body.textContent?.trim()
    if (!text) return null
    const p = doc.createElement("p")
    p.textContent = text
    return p
  }

  const template = doc.createElement("div")
  template.innerHTML = trimmed
  const first = template.firstElementChild
  if (!first) return null

  const tag = first.tagName.toLowerCase()
  if (tag === "html" || tag === "body") {
    const body = tag === "html" ? first.querySelector("body") : first
    if (!body) return null
    const wrapper = doc.createElement("div")
    wrapper.innerHTML = body.innerHTML.trim()
    const child = wrapper.firstElementChild
    if (child) return child
    const text = body.textContent?.trim()
    if (!text) return null
    const p = doc.createElement("p")
    p.textContent = text
    return p
  }

  return first
}

/**
 * ペーストイベントの DataTransfer から HTML を解決する。
 * read() API は使わず、ユーザー操作に付随する clipboardData のみ参照する。
 */
export function resolvePasteHtml(
  data: DataTransfer | null | undefined
): string | null {
  const fromEvent = data?.getData("text/html")?.trim()
  if (fromEvent) return fromEvent
  return getAppClipboard()
}

export function resolvePastePlainText(
  data: DataTransfer | null | undefined
): string | null {
  return data?.getData("text/plain")?.trim() || null
}

/** ペーストイベントの DataTransfer から最初の画像ファイルを取得する */
export function resolvePasteImage(
  data: DataTransfer | null | undefined
): File | null {
  if (!data) return null
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue
    const file = item.getAsFile()
    if (file) return file
  }
  return (
    Array.from(data.files ?? []).find((file) =>
      file.type.startsWith("image/")
    ) ?? null
  )
}

/** ペースト用 HTML / プレーンテキストから挿入する要素を組み立てる */
export function buildPasteNode(
  doc: Document,
  data: DataTransfer | null | undefined
): Element | null {
  const html = resolvePasteHtml(data)
  if (html) {
    const node = parseHtmlFragment(doc, html)
    if (node) return node
  }
  const plain = resolvePastePlainText(data)
  if (!plain) return null
  const p = doc.createElement("p")
  p.textContent = plain
  return p
}

export async function writeSystemClipboard(html: string): Promise<void> {
  try {
    if (!navigator.clipboard?.write) return
    const plain =
      new DOMParser().parseFromString(html, "text/html").body.textContent ?? ""
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([plain], { type: "text/plain" }),
      }),
    ])
  } catch {
    // 権限不足など — アプリ内クリップボードで十分
  }
}
