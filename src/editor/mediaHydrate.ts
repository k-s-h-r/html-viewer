import { acquireProjectDirectory } from "./fileIo"
import { isPlaceholderMediaPath } from "./mediaPlaceholder"
import { applyMediaPreview, registerMediaPreview } from "./mediaPreview"

export function isHydratableRelativePath(src: string): boolean {
  const trimmed = src.trim()
  if (!trimmed || isPlaceholderMediaPath(trimmed)) return false
  return (
    !trimmed.startsWith("blob:") &&
    !trimmed.startsWith("data:") &&
    !/^[a-z][a-z0-9+.-]*:/i.test(trimmed)
  )
}

/** HTML テキスト内に、復元対象の相対パスメディアが含まれるか */
export function htmlHasHydratableMedia(html: string): boolean {
  if (typeof DOMParser === "undefined") return false
  const doc = new DOMParser().parseFromString(html, "text/html")
  return bodyHasHydratableMedia(doc.body)
}

/** HTML ファイル位置 + 相対パスからプロジェクトルート基準のセグメント列を得る */
export function resourcePathSegmentsFromHtml(
  htmlSegments: string[],
  relativePath: string
): string[] {
  const htmlDir = htmlSegments.slice(0, -1)
  const resourceParts = relativePath
    .split(/[?#]/, 1)[0]
    .split("/")
    .filter(Boolean)
  const segments = [...htmlDir]
  for (const part of resourceParts) {
    if (part === ".") continue
    if (part === "..") {
      segments.pop()
      continue
    }
    segments.push(part)
  }
  return segments
}

export function mediaPathSegmentsFromHtml(
  htmlSegments: string[],
  relativePath: string
): string[] {
  return resourcePathSegmentsFromHtml(htmlSegments, relativePath)
}

async function getFileHandleBySegments(
  root: FileSystemDirectoryHandle,
  segments: string[]
): Promise<FileSystemFileHandle | null> {
  if (segments.length === 0) return null
  let dir = root
  for (let i = 0; i < segments.length - 1; i++) {
    try {
      dir = await dir.getDirectoryHandle(segments[i])
    } catch {
      return null
    }
  }
  try {
    return await dir.getFileHandle(segments[segments.length - 1])
  } catch {
    return null
  }
}

export async function readFileFromProject(
  projectDir: FileSystemDirectoryHandle,
  htmlFile: FileSystemFileHandle,
  relativePath: string
): Promise<File | null> {
  const htmlSegments = await projectDir.resolve(htmlFile)
  if (!htmlSegments) return null
  const segments = resourcePathSegmentsFromHtml(htmlSegments, relativePath)
  const handle = await getFileHandleBySegments(projectDir, segments)
  if (!handle) return null
  try {
    return await handle.getFile()
  } catch {
    return null
  }
}

export async function readMediaFileFromProject(
  projectDir: FileSystemDirectoryHandle,
  htmlFile: FileSystemFileHandle,
  relativePath: string
): Promise<File | null> {
  return readFileFromProject(projectDir, htmlFile, relativePath)
}

export function bodyHasHydratableMedia(body: HTMLElement): boolean {
  for (const el of body.querySelectorAll("img, video, audio")) {
    const src = el.getAttribute("src") ?? ""
    if (isHydratableRelativePath(src)) return true
  }
  return false
}

export async function hydrateMediaPreviewsFromProject(
  body: HTMLElement,
  projectDir: FileSystemDirectoryHandle,
  htmlFile: FileSystemFileHandle
): Promise<number> {
  let count = 0
  for (const el of body.querySelectorAll("img, video, audio")) {
    const relativePath = (el.getAttribute("src") ?? "").trim()
    if (!isHydratableRelativePath(relativePath)) continue
    const file = await readMediaFileFromProject(
      projectDir,
      htmlFile,
      relativePath
    )
    if (!file) continue
    registerMediaPreview(relativePath, file)
    applyMediaPreview(el)
    count++
  }
  return count
}

export interface HydrateMediaContext {
  htmlHandle: FileSystemFileHandle | null
  projectDirHandle: FileSystemDirectoryHandle | null
}

/** 読み込み後にディスク上の相対パスメディアを blob プレビューへ復元する */
export async function hydrateMediaAfterDocumentLoad(
  body: HTMLElement,
  context: HydrateMediaContext,
  onProjectDirGranted?: (dir: FileSystemDirectoryHandle) => void
): Promise<void> {
  const { htmlHandle } = context
  if (!htmlHandle || !bodyHasHydratableMedia(body)) return

  let projectDir = context.projectDirHandle
  if (!projectDir) {
    projectDir = await acquireProjectDirectory(htmlHandle, null)
    if (!projectDir) return
    onProjectDirGranted?.(projectDir)
  }

  await hydrateMediaPreviewsFromProject(body, projectDir, htmlHandle)
}
