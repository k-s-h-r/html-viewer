export type SourceValidationResult =
  | { ok: true }
  | { ok: false; message: string }

/** ソースモードから iframe へ適用する前の HTML 検証 */
export function validateSourceHtml(html: string): SourceValidationResult {
  if (!html.trim()) {
    return { ok: false, message: "HTML が空です。" }
  }

  const doc = new DOMParser().parseFromString(html, "text/html")

  if (doc.querySelector("parsererror")) {
    return { ok: false, message: "HTML の解析に失敗しました。" }
  }

  if (!doc.documentElement) {
    return { ok: false, message: "<html> 要素がありません。" }
  }

  if (!doc.body) {
    return { ok: false, message: "<body> 要素がありません。" }
  }

  return { ok: true }
}

/** テスト用: Canvas.loadHtml と同様に Document へ HTML を書き込む */
export function applySourceToDocument(html: string, doc: Document): boolean {
  const result = validateSourceHtml(html)
  if (!result.ok) return false
  doc.open()
  doc.write(html)
  doc.close()
  return true
}
