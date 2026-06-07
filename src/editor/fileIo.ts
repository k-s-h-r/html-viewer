import {
  relativePathFromHandles,
  relativePathFromSegments,
} from "./fsaRelativePath"
import {
  ensureReadPermission,
  ensureReadWritePermission,
  loadRememberedImageSaveDir,
  loadRememberedProjectDirs,
  rememberImageSaveDir,
  rememberProjectDir,
} from "./handleStore"
import { relativeMediaPath } from "./mediaPath"
import type { LoadedFile, SaveResult } from "./types"

interface FilePickerOptions {
  types?: { description?: string; accept: Record<string, string[]> }[]
  multiple?: boolean
  suggestedName?: string
  startIn?: FileSystemHandle
}

interface FilePickerWindow {
  showOpenFilePicker?: (
    opts?: FilePickerOptions
  ) => Promise<FileSystemFileHandle[]>
  showSaveFilePicker?: (
    opts?: FilePickerOptions
  ) => Promise<FileSystemFileHandle>
  showDirectoryPicker?: (opts?: {
    id?: string
    mode?: "read" | "readwrite"
    startIn?: FileSystemHandle
  }) => Promise<FileSystemDirectoryHandle>
}

const fsaWindow = window as unknown as FilePickerWindow

const HTML_PICKER_TYPES = [
  {
    description: "HTML ファイル",
    accept: { "text/html": [".html", ".htm"] },
  },
]

export function supportsFileSystemAccess(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof fsaWindow.showOpenFilePicker === "function" &&
    typeof fsaWindow.showSaveFilePicker === "function"
  )
}

export function supportsDirectoryPicker(): boolean {
  return (
    supportsFileSystemAccess() &&
    typeof fsaWindow.showDirectoryPicker === "function"
  )
}

/** File System Access API があれば優先、なければ input[type=file] で読み込む */
export async function openHtmlFile(): Promise<LoadedFile | null> {
  if (supportsFileSystemAccess()) {
    try {
      const [handle] = await fsaWindow.showOpenFilePicker!({
        types: HTML_PICKER_TYPES,
        multiple: false,
      })
      const file = await handle.getFile()
      const text = await file.text()
      return { text, handle, name: file.name }
    } catch (err) {
      if (isAbortError(err)) return null
      throw err
    }
  }
  return openViaInput()
}

function openViaInput(): Promise<LoadedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".html,.htm,text/html"
    input.style.display = "none"
    document.body.appendChild(input)

    let settled = false
    const cleanup = () => {
      input.remove()
    }
    input.addEventListener("change", async () => {
      settled = true
      const file = input.files?.[0]
      if (!file) {
        cleanup()
        resolve(null)
        return
      }
      const text = await file.text()
      cleanup()
      resolve({ text, handle: null, name: file.name })
    })
    // キャンセル検知(フォーカス復帰後に変更が無ければキャンセル扱い)
    window.addEventListener(
      "focus",
      () => {
        setTimeout(() => {
          if (!settled) {
            cleanup()
            resolve(null)
          }
        }, 500)
      },
      { once: true }
    )
    input.click()
  })
}

/**
 * 保存。FSA ハンドルがあれば同一ファイルへ上書き、無ければ showSaveFilePicker、
 * それも無ければ Blob ダウンロードにフォールバックする。
 */
export async function saveHtmlFile(
  html: string,
  handle: FileSystemFileHandle | null,
  suggestedName: string
): Promise<SaveResult> {
  if (handle) {
    try {
      const writable = await handle.createWritable()
      await writable.write(html)
      await writable.close()
      return { kind: "overwritten", name: suggestedName, handle }
    } catch (err) {
      if (isAbortError(err)) return { kind: "cancelled" }
      // 上書き失敗時は別名保存へフォールバック
    }
  }
  return saveAsHtmlFile(html, suggestedName)
}

/** 別名保存。FSA があればピッカー、無ければダウンロード */
export async function saveAsHtmlFile(
  html: string,
  suggestedName: string
): Promise<SaveResult> {
  if (supportsFileSystemAccess()) {
    try {
      const handle = await fsaWindow.showSaveFilePicker!({
        suggestedName,
        types: HTML_PICKER_TYPES,
      })
      const writable = await handle.createWritable()
      await writable.write(html)
      await writable.close()
      return { kind: "overwritten", name: handle.name, handle }
    } catch (err) {
      if (isAbortError(err)) return { kind: "cancelled" }
      throw err
    }
  }
  downloadHtml(html, suggestedName)
  return { kind: "downloaded", name: suggestedName }
}

function downloadHtml(html: string, name: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export interface PickedRelativeFile {
  relativePath: string
  file: File
}

export interface MediaPickContext {
  htmlHandle: FileSystemFileHandle | null
  projectDirHandle: FileSystemDirectoryHandle | null
}

export interface MediaPickResult extends PickedRelativeFile {
  /** 初回にユーザーが選んだプロジェクトフォルダ（App で保持） */
  projectDirHandle?: FileSystemDirectoryHandle
}

export interface PickedDataUrlImage {
  dataUrl: string
}

export interface SavedPastedImage extends PickedRelativeFile {
  projectDirHandle?: FileSystemDirectoryHandle
}

function mediaPickerTypes(accept: string): FilePickerOptions["types"] {
  if (accept.startsWith("image")) {
    return [
      {
        description: "画像",
        accept: {
          "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"],
        },
      },
    ]
  }
  if (accept.startsWith("video")) {
    return [
      {
        description: "動画",
        accept: { "video/*": [".mp4", ".webm", ".ogg", ".mov"] },
      },
    ]
  }
  if (accept.startsWith("audio")) {
    return [
      {
        description: "音声",
        accept: { "audio/*": [".mp3", ".wav", ".ogg", ".m4a", ".aac"] },
      },
    ]
  }
  return undefined
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") resolve(reader.result)
      else reject(new Error("ファイルを data URL として読み込めませんでした"))
    })
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("ファイルの読み込みに失敗しました"))
    })
    reader.readAsDataURL(file)
  })
}

const IMAGE_EXTENSION_BY_TYPE: Record<string, string> = {
  "image/avif": ".avif",
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/svg+xml": ".svg",
  "image/webp": ".webp",
}

function imageExtension(file: File): string {
  const fromName = /\.[a-z0-9]+$/i.exec(file.name)?.[0].toLowerCase()
  return IMAGE_EXTENSION_BY_TYPE[file.type] ?? fromName ?? ".png"
}

function timestampForFileName(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  )
}

export function pastedImageFileName(file: File, date = new Date()): string {
  return `pasted-${timestampForFileName(date)}${imageExtension(file)}`
}

async function fileExists(
  dir: FileSystemDirectoryHandle,
  name: string
): Promise<boolean> {
  try {
    await dir.getFileHandle(name)
    return true
  } catch {
    return false
  }
}

async function availableImageFileName(
  dir: FileSystemDirectoryHandle,
  file: File
): Promise<string> {
  const first = pastedImageFileName(file)
  if (!(await fileExists(dir, first))) return first
  const dot = first.lastIndexOf(".")
  const base = dot >= 0 ? first.slice(0, dot) : first
  const extension = dot >= 0 ? first.slice(dot) : ""
  for (let suffix = 2; suffix < 10_000; suffix++) {
    const candidate = `${base}-${suffix}${extension}`
    if (!(await fileExists(dir, candidate))) return candidate
  }
  throw new Error("画像ファイル名を決定できませんでした")
}

async function promptImageSaveDirectory(
  startIn: FileSystemDirectoryHandle
): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsDirectoryPicker()) return null
  try {
    return await fsaWindow.showDirectoryPicker!({
      id: "html-editor-pasted-images",
      mode: "readwrite",
      startIn,
    })
  } catch (err) {
    if (isAbortError(err)) return null
    throw err
  }
}

/**
 * クリップボード画像を選択したフォルダへ保存し、
 * HTML ファイル基準の相対パスを返す。
 */
export async function savePastedImageFile(
  file: File,
  context: MediaPickContext,
  chooseDirectory: boolean
): Promise<SavedPastedImage | null> {
  const { htmlHandle } = context
  if (!htmlHandle || !supportsDirectoryPicker()) {
    throw new Error(
      "ファイル保存を使うには、先に HTML ファイルを Chrome / Edge で開くか保存してください"
    )
  }

  let projectDir = context.projectDirHandle
  let projectDirGranted = false
  if (!projectDir) {
    projectDir = await acquireProjectDirectory(htmlHandle)
    if (!projectDir) return null
    projectDirGranted = true
  }

  const htmlSegments = await projectDir.resolve(htmlHandle)
  if (!htmlSegments) {
    throw new Error("HTML を含むプロジェクトフォルダを選択してください")
  }

  let saveDir = await loadRememberedImageSaveDir(projectDir)
  if (saveDir && !(await projectDir.resolve(saveDir))) saveDir = null
  if (chooseDirectory || !saveDir) {
    saveDir = await promptImageSaveDirectory(saveDir ?? projectDir)
    if (!saveDir) return null
  }

  const saveDirSegments = await projectDir.resolve(saveDir)
  if (!saveDirSegments) {
    throw new Error(
      "画像の保存先は、HTML と同じプロジェクトフォルダ内から選択してください"
    )
  }
  if (!(await ensureReadWritePermission(saveDir))) {
    throw new Error("画像保存先への書き込みが許可されていません")
  }

  const name = await availableImageFileName(saveDir, file)
  const relativePath = relativePathFromSegments(htmlSegments, [
    ...saveDirSegments,
    name,
  ])
  if (!relativePath) {
    throw new Error("画像の相対パスを算出できませんでした")
  }

  const handle = await saveDir.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  await writable.write(file)
  await writable.close()
  await rememberImageSaveDir(projectDir, saveDir)

  return {
    relativePath,
    file,
    ...(projectDirGranted ? { projectDirHandle: projectDir } : {}),
  }
}

/** 画像を選択し、HTML 埋め込み用の data URL として読み込む */
export async function pickImageAsDataUrl(): Promise<PickedDataUrlImage | null> {
  if (supportsFileSystemAccess()) {
    try {
      const [handle] = await fsaWindow.showOpenFilePicker!({
        types: mediaPickerTypes("image/*"),
        multiple: false,
      })
      const file = await handle.getFile()
      return { dataUrl: await readFileAsDataUrl(file) }
    } catch (err) {
      if (isAbortError(err)) return null
      throw err
    }
  }

  return pickImageAsDataUrlViaInput()
}

function pickImageAsDataUrlViaInput(): Promise<PickedDataUrlImage | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/*"
    input.style.display = "none"
    document.body.appendChild(input)
    let settled = false
    input.addEventListener("change", async () => {
      settled = true
      const file = input.files?.[0]
      input.remove()
      if (!file) {
        resolve(null)
        return
      }
      try {
        resolve({ dataUrl: await readFileAsDataUrl(file) })
      } catch (err) {
        reject(err)
      }
    })
    window.addEventListener(
      "focus",
      () => {
        setTimeout(() => {
          if (!settled) {
            input.remove()
            resolve(null)
          }
        }, 500)
      },
      { once: true }
    )
    input.click()
  })
}

/** フォルダ選択ダイアログを表示してプロジェクトフォルダを取得する */
async function promptProjectDirectory(
  htmlHandle: FileSystemFileHandle
): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsDirectoryPicker()) return null
  try {
    return await fsaWindow.showDirectoryPicker!({
      id: "html-editor-project",
      mode: "read",
      startIn: htmlHandle,
    })
  } catch (err) {
    if (isAbortError(err)) return null
    throw err
  }
}

/** 記憶済みフォルダのうち、この HTML を含むものを探して再利用する */
async function findRememberedProjectDir(
  htmlHandle: FileSystemFileHandle
): Promise<FileSystemDirectoryHandle | null> {
  const remembered = await loadRememberedProjectDirs()
  for (const dir of remembered) {
    let contains: boolean
    try {
      contains = (await dir.resolve(htmlHandle)) !== null
    } catch {
      continue
    }
    if (!contains) continue
    if (await ensureReadPermission(dir)) return dir
  }
  return null
}

/**
 * 相対パス算出・メディア復元のためのプロジェクトフォルダを取得する。
 * 記憶済みフォルダがあれば再利用（権限のみ再確認）、なければ一度だけ選択を促す。
 */
export async function acquireProjectDirectory(
  htmlHandle: FileSystemFileHandle,
  existing: FileSystemDirectoryHandle | null = null
): Promise<FileSystemDirectoryHandle | null> {
  if (existing) return existing
  if (!supportsDirectoryPicker()) return null

  const reused = await findRememberedProjectDir(htmlHandle)
  if (reused) return reused

  const picked = await promptProjectDirectory(htmlHandle)
  if (picked) await rememberProjectDir(picked)
  return picked
}

/** メディアを選択。FSA + プロジェクトフォルダがあれば resolve で真の相対パス */
export async function pickMediaFile(
  accept: string,
  context: MediaPickContext
): Promise<MediaPickResult | null> {
  const { htmlHandle, projectDirHandle } = context
  let projectDir = projectDirHandle
  let dirGrantedThisPick = false

  if (htmlHandle && supportsFileSystemAccess()) {
    if (!projectDir && supportsDirectoryPicker()) {
      projectDir = await acquireProjectDirectory(htmlHandle, null)
      if (projectDir) dirGrantedThisPick = true
    }

    try {
      const [mediaHandle] = await fsaWindow.showOpenFilePicker!({
        types: mediaPickerTypes(accept),
        multiple: false,
        startIn: htmlHandle,
      })
      const file = await mediaHandle.getFile()
      let relativePath = relativeMediaPath(file)
      if (projectDir) {
        const resolved = await relativePathFromHandles(
          projectDir,
          htmlHandle,
          mediaHandle
        )
        if (resolved) relativePath = resolved
      }
      return {
        relativePath,
        file,
        ...(dirGrantedThisPick && projectDir
          ? { projectDirHandle: projectDir }
          : {}),
      }
    } catch (err) {
      if (isAbortError(err)) return null
      throw err
    }
  }

  return pickMediaFileViaInput(accept)
}

function pickMediaFileViaInput(
  accept: string
): Promise<PickedRelativeFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = accept
    input.style.display = "none"
    document.body.appendChild(input)
    let settled = false
    input.addEventListener("change", () => {
      settled = true
      const file = input.files?.[0]
      input.remove()
      if (!file) {
        resolve(null)
        return
      }
      resolve({
        relativePath: relativeMediaPath(file),
        file,
      })
    })
    window.addEventListener(
      "focus",
      () => {
        setTimeout(() => {
          if (!settled) {
            input.remove()
            resolve(null)
          }
        }, 500)
      },
      { once: true }
    )
    input.click()
  })
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError"
}

/** ドロップされた File が HTML として受理可能か */
export function isAcceptedHtmlFile(file: File): boolean {
  const lower = file.name.toLowerCase()
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return true
  return file.type === "text/html"
}

interface DataTransferItemWithFsHandle extends DataTransferItem {
  getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>
}

async function resolveHandleFromItem(
  item: DataTransferItem
): Promise<FileSystemFileHandle | null> {
  const withHandle = item as DataTransferItemWithFsHandle
  if (typeof withHandle.getAsFileSystemHandle !== "function") return null
  try {
    const handle = await withHandle.getAsFileSystemHandle()
    return handle?.kind === "file" ? (handle as FileSystemFileHandle) : null
  } catch {
    return null
  }
}

async function loadedFileFromFile(
  file: File,
  handle: FileSystemFileHandle | null
): Promise<LoadedFile> {
  return { text: await file.text(), handle, name: file.name }
}

/** DataTransfer から HTML ファイルを読み込む。受理できなければ null */
export async function readDroppedHtml(
  dataTransfer: DataTransfer
): Promise<LoadedFile | null> {
  const { items } = dataTransfer

  if (items.length > 0) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind !== "file") continue
      const file = item.getAsFile()
      if (!file || !isAcceptedHtmlFile(file)) continue
      const handle = await resolveHandleFromItem(item)
      return loadedFileFromFile(file, handle)
    }
    return null
  }

  const file = dataTransfer.files[0]
  if (!file || !isAcceptedHtmlFile(file)) return null
  return loadedFileFromFile(file, null)
}
