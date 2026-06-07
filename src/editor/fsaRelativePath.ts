/**
 * FileSystemDirectoryHandle.resolve() の結果から、
 * HTML ファイルがあるディレクトリ基準の相対パス（例: ./images/a.png）を組み立てる。
 */
export function relativePathFromSegments(
  htmlSegments: string[],
  mediaSegments: string[]
): string | null {
  if (htmlSegments.length === 0 || mediaSegments.length === 0) return null

  const htmlDir = htmlSegments.slice(0, -1)
  let commonLength = 0
  while (
    commonLength < htmlDir.length &&
    commonLength < mediaSegments.length &&
    htmlDir[commonLength] === mediaSegments[commonLength]
  ) {
    commonLength++
  }

  const up = Array(htmlDir.length - commonLength).fill("..")
  const down = mediaSegments.slice(commonLength)
  const path = [...up, ...down].join("/")
  if (!path) return null
  return up.length > 0 ? path : `./${path}`
}

export async function relativePathFromHandles(
  rootDir: FileSystemDirectoryHandle,
  htmlFile: FileSystemFileHandle,
  mediaFile: FileSystemFileHandle
): Promise<string | null> {
  const htmlSegments = await rootDir.resolve(htmlFile)
  const mediaSegments = await rootDir.resolve(mediaFile)
  if (!htmlSegments || !mediaSegments) return null
  return relativePathFromSegments(htmlSegments, mediaSegments)
}
