/**
 * File System Access API のハンドル（プロジェクトフォルダ）を IndexedDB に永続化し、
 * 再訪時に「最初の1回だけ許可」で相対パスメディアを参照できるようにする。
 */

const DB_NAME = "html-editor"
const DB_VERSION = 1
const STORE = "handles"
const PROJECT_DIRS_KEY = "project-dirs"
const IMAGE_SAVE_DIRS_KEY = "image-save-dirs"
const MAX_REMEMBERED = 8

interface PermissionCapableHandle {
  queryPermission?: (opts: {
    mode: "read" | "readwrite"
  }) => Promise<PermissionState>
  requestPermission?: (opts: {
    mode: "read" | "readwrite"
  }) => Promise<PermissionState>
}

interface RememberedImageSaveDir {
  projectDir: FileSystemDirectoryHandle
  saveDir: FileSystemDirectoryHandle
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null)
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      resolve(null)
      return
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
  })
}

function idbGet<T>(db: IDBDatabase, key: string): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly")
      const req = tx.objectStore(STORE).get(key)
      req.onsuccess = () => resolve((req.result as T) ?? null)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

function idbSet(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite")
      tx.objectStore(STORE).put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

/** 保存済みのプロジェクトフォルダハンドル一覧（新しい順） */
export async function loadRememberedProjectDirs(): Promise<
  FileSystemDirectoryHandle[]
> {
  const db = await openDb()
  if (!db) return []
  const list = await idbGet<FileSystemDirectoryHandle[]>(db, PROJECT_DIRS_KEY)
  db.close()
  return Array.isArray(list) ? list : []
}

/** プロジェクトフォルダハンドルを記憶（重複は除去し、新しい順に保持） */
export async function rememberProjectDir(
  dir: FileSystemDirectoryHandle
): Promise<void> {
  const db = await openDb()
  if (!db) return
  const existing =
    (await idbGet<FileSystemDirectoryHandle[]>(db, PROJECT_DIRS_KEY)) ?? []

  const deduped: FileSystemDirectoryHandle[] = [dir]
  for (const handle of existing) {
    let same: boolean
    try {
      same = await dir.isSameEntry(handle)
    } catch {
      continue
    }
    if (!same) deduped.push(handle)
    if (deduped.length >= MAX_REMEMBERED) break
  }

  await idbSet(db, PROJECT_DIRS_KEY, deduped)
  db.close()
}

/** プロジェクトごとの画像保存先フォルダを取得する */
export async function loadRememberedImageSaveDir(
  projectDir: FileSystemDirectoryHandle
): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDb()
  if (!db) return null
  const list =
    (await idbGet<RememberedImageSaveDir[]>(db, IMAGE_SAVE_DIRS_KEY)) ?? []
  db.close()

  for (const entry of list) {
    try {
      if (await projectDir.isSameEntry(entry.projectDir)) return entry.saveDir
    } catch {
      continue
    }
  }
  return null
}

/** プロジェクトごとの画像保存先フォルダを記憶する */
export async function rememberImageSaveDir(
  projectDir: FileSystemDirectoryHandle,
  saveDir: FileSystemDirectoryHandle
): Promise<void> {
  const db = await openDb()
  if (!db) return
  const existing =
    (await idbGet<RememberedImageSaveDir[]>(db, IMAGE_SAVE_DIRS_KEY)) ?? []
  const deduped: RememberedImageSaveDir[] = [{ projectDir, saveDir }]

  for (const entry of existing) {
    let sameProject: boolean
    try {
      sameProject = await projectDir.isSameEntry(entry.projectDir)
    } catch {
      continue
    }
    if (!sameProject) deduped.push(entry)
    if (deduped.length >= MAX_REMEMBERED) break
  }

  await idbSet(db, IMAGE_SAVE_DIRS_KEY, deduped)
  db.close()
}

/** 読み取り権限を確認し、必要なら（ユーザー操作中に）要求する */
export async function ensureReadPermission(
  handle: FileSystemHandle
): Promise<boolean> {
  const h = handle as FileSystemHandle & PermissionCapableHandle
  if (typeof h.queryPermission !== "function") return true
  try {
    if ((await h.queryPermission({ mode: "read" })) === "granted") return true
    if (typeof h.requestPermission !== "function") return false
    return (await h.requestPermission({ mode: "read" })) === "granted"
  } catch {
    return false
  }
}

/** 読み書き権限を確認し、必要なら（ユーザー操作中に）要求する */
export async function ensureReadWritePermission(
  handle: FileSystemHandle
): Promise<boolean> {
  const h = handle as FileSystemHandle & PermissionCapableHandle
  if (typeof h.queryPermission !== "function") return true
  try {
    if ((await h.queryPermission({ mode: "readwrite" })) === "granted")
      return true
    if (typeof h.requestPermission !== "function") return false
    return (await h.requestPermission({ mode: "readwrite" })) === "granted"
  } catch {
    return false
  }
}
