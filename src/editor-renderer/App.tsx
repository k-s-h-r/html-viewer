import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Toaster } from "@/components/ui/sonner"
import { Canvas, type CanvasHandle } from "@/components/editor/Canvas"
import { SourcePanel } from "@/components/editor/SourcePanel"
import { Toolbar } from "@/components/editor/Toolbar"
import { OutlinePanel } from "@/components/editor/OutlinePanel"
import { Inspector } from "@/components/editor/Inspector"
import { WelcomeOverlay } from "@/components/editor/WelcomeOverlay"
import {
  acquireProjectDirectory,
  openHtmlFile,
  readDroppedHtml,
  saveAsHtmlFile,
  saveHtmlFile,
  supportsFileSystemAccess,
} from "@/editor/fileIo"
import { htmlHasHydratableMedia } from "@/editor/mediaHydrate"
import { htmlHasHydratableStylesheets } from "@/editor/stylesheetHydrate"
import { clearAppClipboard } from "@/editor/clipboard"
import { emptyDocumentHtml } from "@/editor/serialize"
import { emptyStyleCatalog } from "@/editor/styleProps"
import { useDocumentHistory } from "@/hooks/useDocumentHistory"
import { useSourceMode } from "@/hooks/useSourceMode"
import type { EditorApi, EditorDocument } from "@/shared/types"
import type {
  EditorMode,
  ElementPath,
  OutlineNode,
  SelectionInfo,
  StyleCatalog,
} from "@/editor/types"

function getHostApi(): EditorApi | null {
  if (typeof window === "undefined" || !("editorApi" in window)) return null
  return window.editorApi
}

function confirmDiscardSourceChanges(): boolean {
  return confirm("ソースに未適用の変更があります。破棄しますか?")
}

function confirmSaveWithUnappliedSource(): boolean {
  return confirm("未適用のソース変更は保存されません。続行しますか?")
}

function outlinePathKey(path: ElementPath): string {
  return path.join(".")
}

function outlineAncestorKeys(path: ElementPath): string[] {
  return path.slice(0, -1).map((_, i) => outlinePathKey(path.slice(0, i + 1)))
}

function collectCollapsibleOutlineKeys(
  nodes: OutlineNode[],
  keys = new Set<string>()
): Set<string> {
  for (const node of nodes) {
    if (node.children.length > 0) keys.add(outlinePathKey(node.path))
    collectCollapsibleOutlineKeys(node.children, keys)
  }
  return keys
}

export function App() {
  const canvasRef = useRef<CanvasHandle>(null)
  const allowCloseRef = useRef(false)
  const historyRestoreInProgressRef = useRef(false)
  const [canvasHandle, setCanvasHandle] = useState<CanvasHandle | null>(null)
  const [mode, setMode] = useState<EditorMode>("edit")
  const [selection, setSelection] = useState<SelectionInfo | null>(null)
  const [selectionCount, setSelectionCount] = useState(0)
  const [selectedPaths, setSelectedPaths] = useState<ElementPath[]>([])
  const [selectionStructureEditable, setSelectionStructureEditable] =
    useState(false)
  const [outline, setOutline] = useState<OutlineNode[]>([])
  const [collapsedOutlinePaths, setCollapsedOutlinePaths] = useState<
    Set<string>
  >(() => new Set())
  const [styleCatalog, setStyleCatalog] =
    useState<StyleCatalog>(emptyStyleCatalog)
  const [fileName, setFileName] = useState<string | null>(null)
  const [hostDocument, setHostDocument] = useState<EditorDocument | null>(null)
  const [handle, setHandle] = useState<FileSystemFileHandle | null>(null)
  const [projectDirHandle, setProjectDirHandle] =
    useState<FileSystemDirectoryHandle | null>(null)
  const {
    dirty,
    markClean,
    hasDocument,
    canUndo,
    canRedo,
    resetHistory,
    pushHistory,
    replaceCurrentHistory,
    undo,
    redo,
  } = useDocumentHistory()
  const [isDragOver, setIsDragOver] = useState(false)
  const dragDepthRef = useRef(0)
  const {
    sourceText,
    sourceDirty,
    sourceError,
    sourceScrollOffset,
    sourceScrollToken,
    resetSource,
    showSourceSnapshot,
    updateSourceText,
    markSourceClean,
    applySourceText,
  } = useSourceMode()

  const hostApi = getHostApi()
  const hostMode = !!hostDocument && !!hostApi
  const fsaSupported = hostMode || supportsFileSystemAccess()
  const canvasMode: EditorMode = mode === "source" ? "view" : mode

  const setCanvasRef = useCallback((handle: CanvasHandle | null) => {
    canvasRef.current = handle
    setCanvasHandle(handle)
  }, [])

  const loadDocument = useCallback(
    (
      html: string,
      meta: {
        name: string
        handle: FileSystemFileHandle | null
        baseHref?: string | null
        projectDirHandle?: FileSystemDirectoryHandle | null
      }
    ) => {
      setHandle(meta.handle)
      setProjectDirHandle(meta.projectDirHandle ?? null)
      setFileName(meta.name)
      resetHistory(html)
      setSelection(null)
      setSelectionCount(0)
      setSelectedPaths([])
      setSelectionStructureEditable(false)
      setCollapsedOutlinePaths(new Set())
      setMode("edit")
      resetSource()
      clearAppClipboard()
      // 次の描画で iframe が確実に存在するように。
      // state 反映を待たず、メディア復元用ハンドルを直接渡す。
      const hydrateContext = {
        htmlHandle: meta.handle,
        projectDirHandle: meta.projectDirHandle ?? null,
      }
      requestAnimationFrame(() => {
        canvasRef.current?.loadHtml(html, {
          baseHref: meta.baseHref ?? null,
          clearMediaPreviews: true,
          hydrateContext,
        })
        requestAnimationFrame(() => {
          const normalized = canvasRef.current?.getCleanHtml()
          if (normalized) resetHistory(normalized)
        })
      })
    },
    [resetHistory, resetSource]
  )

  useEffect(() => {
    let active = true
    const api = getHostApi()
    if (!api) return

    void api
      .getInitialDocument()
      .then((document) => {
        if (!active || !document) return
        setHostDocument(document)
        loadDocument(document.html, {
          name: document.name,
          handle: null,
          baseHref: document.baseHref,
        })
      })
      .catch((err) => {
        toast.error("編集対象の読み込みに失敗しました")
        console.error(err)
      })

    return () => {
      active = false
    }
  }, [loadDocument])

  const handleCommit = useCallback(
    (cleanHtml: string) => {
      if (historyRestoreInProgressRef.current) return
      pushHistory(cleanHtml)
    },
    [pushHistory]
  )

  const handleSelectionChange = useCallback((info: SelectionInfo | null) => {
    setSelection(info)
    if (!info) return
    const ancestors = outlineAncestorKeys(info.path)
    if (ancestors.length === 0) return
    setCollapsedOutlinePaths((prev) => {
      let changed = false
      const next = new Set(prev)
      for (const key of ancestors) {
        if (next.delete(key)) changed = true
      }
      return changed ? next : prev
    })
  }, [])

  const handleToggleOutlineCollapse = useCallback((path: ElementPath) => {
    const key = outlinePathKey(path)
    setCollapsedOutlinePaths((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const handleExpandAllOutline = useCallback(() => {
    setCollapsedOutlinePaths(new Set())
  }, [])

  const handleCollapseAllOutline = useCallback(() => {
    setCollapsedOutlinePaths(collectCollapsibleOutlineKeys(outline))
  }, [outline])

  const handleExit = useCallback(() => {
    if ((dirty || sourceDirty) && !confirm("未保存の変更があります。終了しますか?")) {
      return
    }
    allowCloseRef.current = true
    const api = getHostApi()
    if (api) {
      void api.close()
      return
    }
    window.close()
  }, [dirty, sourceDirty])

  const handleNew = useCallback(() => {
    if (dirty && !confirm("未保存の変更があります。新規作成しますか?")) return
    if (mode === "source" && sourceDirty && !confirmDiscardSourceChanges())
      return
    loadDocument(emptyDocumentHtml(), {
      name: "新しい仕様書.html",
      handle: null,
    })
  }, [dirty, loadDocument, mode, sourceDirty])

  const confirmOpenIfDirty = useCallback(() => {
    if (dirty && !confirm("未保存の変更があります。別のファイルを開きますか?"))
      return false
    if (mode === "source" && sourceDirty && !confirmDiscardSourceChanges())
      return false
    return true
  }, [dirty, mode, sourceDirty])

  const acquireProjectDirForDoc = useCallback(
    async (
      handle: FileSystemFileHandle | null,
      text: string
    ): Promise<FileSystemDirectoryHandle | null> => {
      if (!handle || !supportsFileSystemAccess()) return null
      if (
        !htmlHasHydratableMedia(text) &&
        !htmlHasHydratableStylesheets(text)
      ) {
        return null
      }
      try {
        return await acquireProjectDirectory(handle)
      } catch (err) {
        console.error(err)
        return null
      }
    },
    []
  )

  const handleOpen = useCallback(async () => {
    if (!confirmOpenIfDirty()) return
    try {
      const result = await openHtmlFile()
      if (!result) return
      const projectDirHandle = await acquireProjectDirForDoc(
        result.handle,
        result.text
      )
      loadDocument(result.text, {
        name: result.name,
        handle: result.handle,
        projectDirHandle,
      })
      toast.success(`${result.name} を読み込みました`)
    } catch (err) {
      toast.error("ファイルの読み込みに失敗しました")
      console.error(err)
    }
  }, [confirmOpenIfDirty, loadDocument, acquireProjectDirForDoc])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLElement>) => {
    if (!e.dataTransfer.types.includes("Files")) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "copy"
  }, [])

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLElement>) => {
    if (!e.dataTransfer.types.includes("Files")) return
    e.preventDefault()
    dragDepthRef.current += 1
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLElement>) => {
    if (!e.dataTransfer.types.includes("Files")) return
    e.preventDefault()
    dragDepthRef.current -= 1
    if (dragDepthRef.current <= 0) {
      dragDepthRef.current = 0
      setIsDragOver(false)
    }
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault()
      dragDepthRef.current = 0
      setIsDragOver(false)

      const hasFiles =
        e.dataTransfer.files.length > 0 ||
        Array.from(e.dataTransfer.items).some((item) => item.kind === "file")

      try {
        const result = await readDroppedHtml(e.dataTransfer)
        if (!result) {
          if (hasFiles) toast.error("HTML ファイルのみドロップできます")
          return
        }
        if (!confirmOpenIfDirty()) return
        const projectDirHandle = await acquireProjectDirForDoc(
          result.handle,
          result.text
        )
        loadDocument(result.text, {
          name: result.name,
          handle: result.handle,
          projectDirHandle,
        })
        toast.success(`${result.name} を読み込みました`)
      } catch (err) {
        toast.error("ファイルの読み込みに失敗しました")
        console.error(err)
      }
    },
    [confirmOpenIfDirty, loadDocument, acquireProjectDirForDoc]
  )

  const handleSave = useCallback(async () => {
    if (mode === "source" && sourceDirty && !confirmSaveWithUnappliedSource())
      return
    const html = canvasRef.current?.getCleanHtml()
    if (!html) return
    try {
      if (hostMode) {
        await hostApi.savePage(html)
        replaceCurrentHistory(html)
        if (mode === "source") markSourceClean(html)
        markClean(html)
        toast.success(`${fileName ?? "HTML"} に保存しました`)
        return
      }
      const res = await saveHtmlFile(html, handle, fileName ?? "仕様書.html")
      if (res.kind === "cancelled") return
      replaceCurrentHistory(html)
      if (mode === "source") markSourceClean(html)
      markClean(html)
      if (res.kind === "overwritten") {
        if (res.handle) setHandle(res.handle)
        setFileName(res.name)
        toast.success(`${res.name} に保存しました`)
      } else {
        toast.success(`${res.name} をダウンロードしました`)
      }
    } catch (err) {
      toast.error("保存に失敗しました")
      console.error(err)
    }
  }, [
    handle,
    hostApi,
    hostMode,
    fileName,
    markSourceClean,
    markClean,
    mode,
    replaceCurrentHistory,
    sourceDirty,
  ])

  const handleSaveAs = useCallback(async () => {
    if (mode === "source" && sourceDirty && !confirmSaveWithUnappliedSource())
      return
    const html = canvasRef.current?.getCleanHtml()
    if (!html) return
    try {
      if (hostMode) {
        await hostApi.savePage(html)
        replaceCurrentHistory(html)
        if (mode === "source") markSourceClean(html)
        markClean(html)
        toast.success(`${fileName ?? "HTML"} に保存しました`)
        return
      }
      const res = await saveAsHtmlFile(html, fileName ?? "仕様書.html")
      if (res.kind === "cancelled") return
      replaceCurrentHistory(html)
      if (mode === "source") markSourceClean(html)
      markClean(html)
      if (res.kind === "overwritten") {
        if (res.handle) setHandle(res.handle)
        setFileName(res.name)
        toast.success(`${res.name} に保存しました`)
      } else {
        toast.success(`${res.name} をダウンロードしました`)
      }
    } catch (err) {
      toast.error("保存に失敗しました")
      console.error(err)
    }
  }, [
    hostApi,
    hostMode,
    fileName,
    markSourceClean,
    markClean,
    mode,
    replaceCurrentHistory,
    sourceDirty,
  ])

  const finishHistoryRestore = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const normalized = canvasRef.current?.getCleanHtml()
        if (normalized) replaceCurrentHistory(normalized)
        historyRestoreInProgressRef.current = false
      })
    })
  }, [replaceCurrentHistory])

  const handleUndo = useCallback(() => {
    if (!canUndo) return
    historyRestoreInProgressRef.current = true
    undo((html) => {
      canvasRef.current?.loadHtml(html)
    })
    finishHistoryRestore()
  }, [canUndo, finishHistoryRestore, undo])

  const handleRedo = useCallback(() => {
    if (!canRedo) return
    historyRestoreInProgressRef.current = true
    redo((html) => {
      canvasRef.current?.loadHtml(html)
    })
    finishHistoryRestore()
  }, [canRedo, finishHistoryRestore, redo])

  const handleModeChange = useCallback(
    (next: EditorMode) => {
      if (next === mode) return

      if (mode === "source" && next !== "source" && sourceDirty) {
        if (!confirmDiscardSourceChanges()) return
      }

      if (next === "source") {
        const snapshot = canvasRef.current?.getCleanHtmlForSource() ?? {
          html: "",
          scrollOffset: null,
        }
        showSourceSnapshot(snapshot)
        setSelection(null)
        setSelectionCount(0)
        setSelectedPaths([])
        setSelectionStructureEditable(false)
        canvasRef.current?.clearSelection()
      }

      if (next === "view") {
        setSelection(null)
        setSelectionCount(0)
        setSelectedPaths([])
        setSelectionStructureEditable(false)
        canvasRef.current?.clearSelection()
      }

      setMode(next)
    },
    [mode, showSourceSnapshot, sourceDirty]
  )

  const handleApplySource = useCallback(() => {
    const normalized = applySourceText(
      (html) => canvasRef.current?.loadHtml(html),
      () => canvasRef.current?.getCleanHtml(),
      replaceCurrentHistory
    )
    if (normalized === null) return
    toast.success("ソースを適用しました")
  }, [applySourceText, replaceCurrentHistory])

  // E2E テスト用フック(開発ビルドのみ)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as {
      __specEditor?: {
        getCleanHtml: () => string | undefined
        loadDocument: (html: string, name: string) => void
      }
    }
    w.__specEditor = {
      getCleanHtml: () => canvasRef.current?.getCleanHtml(),
      loadDocument: (html, name) => loadDocument(html, { name, handle: null }),
    }
    return () => {
      delete w.__specEditor
    }
  }, [loadDocument])

  // キーボードショートカット
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const key = e.key.toLowerCase()
      if (key === "s") {
        e.preventDefault()
        void handleSave()
      } else if (key === "z" && !e.shiftKey) {
        if (mode === "source") return
        e.preventDefault()
        handleUndo()
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        if (mode === "source") return
        e.preventDefault()
        handleRedo()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [handleSave, handleUndo, handleRedo, mode])

  // 未保存時の離脱警告（終了ボタンで確認済みの場合はスキップ）
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (allowCloseRef.current) return
      if (!dirty && !sourceDirty) return
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [dirty, sourceDirty])

  const sidePanelsDisabled = mode === "source"

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <Toolbar
        fileName={fileName}
        dirty={dirty || sourceDirty}
        mode={mode}
        hasDocument={hasDocument}
        canUndo={canUndo}
        canRedo={canRedo}
        fsaSupported={fsaSupported}
        hostMode={hostMode}
        onNew={handleNew}
        onOpen={handleOpen}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onModeChange={handleModeChange}
        onExit={handleExit}
      />

      <div className="flex min-h-0 flex-1">
        <aside className="flex min-h-0 w-60 shrink-0 flex-col border-r bg-background">
          <OutlinePanel
            nodes={outline}
            selectedPath={selection?.path ?? null}
            selectedPaths={selectedPaths}
            collapsedPaths={collapsedOutlinePaths}
            disabled={sidePanelsDisabled}
            onToggleCollapse={handleToggleOutlineCollapse}
            onExpandAll={handleExpandAllOutline}
            onCollapseAll={handleCollapseAllOutline}
            onMoveElement={(path, targetPath, placement) => {
              canvasRef.current?.moveElement(path, targetPath, placement)
            }}
            onSelect={(path, selectMode) => {
              canvasRef.current?.selectByPath(path, selectMode)
            }}
          />
        </aside>

        <main
          className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
          data-testid="canvas-dropzone"
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragOver && mode !== "source" && (
            <div
              className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-primary bg-primary/10"
              data-testid="canvas-dropzone-overlay"
            >
              <p className="rounded-lg bg-background/90 px-6 py-3 text-lg font-medium shadow-sm">
                ここに HTML をドロップ
              </p>
            </div>
          )}
          <div className={mode === "source" ? "hidden h-full" : "h-full"}>
            <Canvas
              ref={setCanvasRef}
              mode={canvasMode}
              htmlFileHandle={handle}
              projectDirHandle={projectDirHandle}
              onProjectDirHandleChange={setProjectDirHandle}
              onSelectionChange={handleSelectionChange}
              onSelectionCountChange={setSelectionCount}
              onSelectionPathsChange={setSelectedPaths}
              onSelectionStructureEditableChange={setSelectionStructureEditable}
              onOutlineChange={setOutline}
              onCatalogChange={setStyleCatalog}
              onCommit={handleCommit}
            />
          </div>
          {mode === "source" && hasDocument && (
            <SourcePanel
              text={sourceText}
              sourceDirty={sourceDirty}
              error={sourceError}
              scrollToOffset={sourceScrollOffset}
              scrollToken={sourceScrollToken}
              onTextChange={updateSourceText}
              onApply={handleApplySource}
            />
          )}
          {!hasDocument && (
            <WelcomeOverlay
              fsaSupported={fsaSupported}
              onOpen={handleOpen}
              onNew={handleNew}
            />
          )}
        </main>

        <aside className="flex min-h-0 w-72 shrink-0 flex-col border-l bg-background">
          <Inspector
            selection={selection}
            selectionCount={selectionCount}
            selectionStructureEditable={selectionStructureEditable}
            canvas={canvasHandle}
            catalog={styleCatalog}
            disabled={sidePanelsDisabled}
          />
        </aside>
      </div>
      <Toaster position="bottom-right" />
    </div>
  )
}

export default App
