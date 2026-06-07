/** 保存 HTML に書くダミー相対パス（実ファイルは不要） */
export const MEDIA_PLACEHOLDER_PATH = "./placeholder.png"

/** エディタ内プレビュー専用（保存時は MEDIA_PLACEHOLDER_PATH に戻す） */
export const MEDIA_PLACEHOLDER_SVG =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180">' +
      '<rect width="320" height="180" fill="#e5e7eb"/>' +
      '<text x="160" y="95" font-size="16" text-anchor="middle" fill="#6b7280">' +
      "画像を選択" +
      "</text></svg>"
  )

export function isPlaceholderMediaPath(path: string | null | undefined): boolean {
  if (!path) return true
  const normalized = path.trim()
  return (
    normalized === "" ||
    normalized === MEDIA_PLACEHOLDER_PATH ||
    normalized === "placeholder.png"
  )
}
