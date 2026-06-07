import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import { Lock } from "lucide-react"
import { toast } from "sonner"

import { PasteImageDialog } from "@/components/editor/PasteImageDialog"
import { ImageAnnotationDialog } from "@/components/editor/ImageAnnotationDialog"
import {
  EDITOR_INJECTED_ATTR,
  ELEMENT_LOCKED_ATTR,
  buildOutline,
  buildSelectionInfo,
  getElementPath,
  hasLockedDescendant,
  isElementLocked,
  resolveElementPath,
} from "@/editor/dom"
import {
  buildPasteNode,
  resolvePasteImage,
  resolvePasteHtml,
  resolvePastePlainText,
  setAppClipboard,
  writeSystemClipboard,
} from "@/editor/clipboard"
import {
  serializeCleanDocument,
  serializeCleanElement,
} from "@/editor/serialize"
import {
  SOURCE_SCROLL_ANCHOR_TEXT,
  stripSourceScrollAnchor,
} from "@/editor/sourceScroll"
import { resolveDocumentBaseHref } from "@/editor/baseHref"
import { harvestStyleCatalog } from "@/editor/styleProps"
import {
  pickImageAsDataUrl,
  pickMediaFile,
  readFileAsDataUrl,
  savePastedImageFile,
  supportsDirectoryPicker,
  type MediaPickContext,
} from "@/editor/fileIo"
import {
  hydrateMediaAfterDocumentLoad,
  type HydrateMediaContext,
} from "@/editor/mediaHydrate"
import { hydrateExternalStylesheetsAfterDocumentLoad } from "@/editor/stylesheetHydrate"
import {
  EDITOR_MEDIA_SRC_ATTR,
  applyMediaPreview,
  applyMediaPreviewToBody,
  clearMediaPreviewRegistry,
  setMediaSourceWithPreview,
} from "@/editor/mediaPreview"
import { resolveSelectTarget } from "@/editor/selectTarget"
import { FORMAT_TAG, unwrapElement, wrapRangeWithTag } from "@/editor/domEdit"
import { createCustomHtmlElement } from "@/editor/customHtml"
import { applyTableOp, type TableOp } from "@/editor/tableOps"
import {
  selectionCount as countSelection,
  toggleSelectionMember,
} from "@/editor/selection"
import { applyColumnOp, type ColumnOp } from "@/editor/columnOps"
import { setGridColumnCount, type GridColumnCount } from "@/editor/gridOps"
import {
  elementUsesLayoutStyles,
  ensureLayoutStyles,
} from "@/editor/layoutStyles"
import {
  applyImageAnnotation,
  imageAnnotationWrapper,
  imageAnnotationSnapshot,
  imageInAnnotationWrapper,
  type ImageAnnotationSnapshot,
} from "@/editor/imageAnnotation"
import type {
  EditorMode,
  ElementPath,
  OutlineNode,
  SelectionInfo,
  StyleCatalog,
} from "@/editor/types"

export interface SourceHtmlSnapshot {
  html: string
  scrollOffset: number | null
}

export interface LoadHtmlOptions {
  baseHref?: string | null
  clearMediaPreviews?: boolean
  /** 読み込み直後のメディア復元に使うハンドル（state 反映を待たず確実に渡す） */
  hydrateContext?: HydrateMediaContext
}

export interface CanvasHandle {
  loadHtml: (html: string, options?: LoadHtmlOptions) => void
  getCleanHtml: () => string
  /** 選択要素直前に一時マーカーを付けたクリーン HTML（マーカーは除去済み） */
  getCleanHtmlForSource: () => SourceHtmlSnapshot
  selectByPath: (path: ElementPath, mode?: "replace" | "add" | "range") => void
  clearSelection: () => void
  insertBlock: (html: string) => void
  getSelectedHtml: () => string | null
  replaceSelectedHtml: (html: string) => boolean
  deleteSelected: () => void
  moveSelected: (dir: "up" | "down") => void
  moveElement: (
    path: ElementPath,
    targetPath: ElementPath,
    placement: "before" | "after" | "inside"
  ) => void
  duplicateSelected: () => void
  copySelected: () => void
  cutSelected: () => void
  pasteFromClipboard: (data?: DataTransfer | null) => void
  startTextEdit: () => void
  applyFormat: (command: "bold" | "italic" | "underline" | "link") => void
  /** img / video / audio の src をファイル選択で相対パスに設定 */
  chooseMediaSource: () => Promise<void>
  /** img の src をファイル選択で data URL に設定 */
  chooseImageAsDataUrl: () => Promise<void>
  /** 選択画像上のSVG図形編集ダイアログを開く */
  openImageAnnotationEditor: () => void
  /** 注釈ラッパーを考慮して選択画像の表示幅を設定 */
  setSelectedImageDisplayWidth: (value: string) => void
  setBooleanAttributeOnSelected: (name: string, enabled: boolean) => void
  tableOp: (op: TableOp) => void
  columnOp: (op: ColumnOp) => void
  setGridColumnCount: (count: GridColumnCount) => void
  setAttributeOnSelected: (name: string, value: string) => void
  setStyleOnSelected: (prop: string, value: string) => void
  setStyleOnSelection: (prop: string, value: string) => void
  setDetailsOpen: (open: boolean) => void
  setLockedOnSelected: (locked: boolean) => void
}

interface CanvasProps {
  mode: EditorMode
  htmlFileHandle?: FileSystemFileHandle | null
  projectDirHandle?: FileSystemDirectoryHandle | null
  onProjectDirHandleChange?: (handle: FileSystemDirectoryHandle | null) => void
  onSelectionChange: (info: SelectionInfo | null) => void
  onSelectionCountChange: (count: number) => void
  onSelectionPathsChange: (paths: ElementPath[]) => void
  onSelectionStructureEditableChange: (editable: boolean) => void
  onOutlineChange: (nodes: OutlineNode[]) => void
  onCatalogChange: (catalog: StyleCatalog) => void
  onCommit: (cleanHtml: string) => void
}

interface Box {
  top: number
  left: number
  width: number
  height: number
}

interface SelectBoxOverlay {
  box: Box
  isPrimary: boolean
  isLocked: boolean
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function injectBaseHref(html: string, baseHref?: string | null): string {
  if (!baseHref) return html

  const base = `<base ${EDITOR_INJECTED_ATTR} href="${escapeAttribute(baseHref)}">`
  if (/<base\b/i.test(html)) return html
  if (/<head(\s[^>]*)?>/i.test(html)) {
    return html.replace(/<head(\s[^>]*)?>/i, (match) => `${match}\n${base}`)
  }
  if (/<html(\s[^>]*)?>/i.test(html)) {
    return html.replace(/<html(\s[^>]*)?>/i, (match) => `${match}\n<head>${base}</head>`)
  }
  return `<head>${base}</head>\n${html}`
}

function isStructureLocked(el: Element | null): boolean {
  return !!el && (isElementLocked(el) || hasLockedDescendant(el))
}

function structureElementFor(el: Element): Element {
  return imageAnnotationWrapper(el) ?? el
}

function selectionElementFor(el: Element): Element {
  return imageInAnnotationWrapper(el) ?? el
}

function canAcceptMovedChild(parent: Element, child: Element): boolean {
  const parentTag = parent.tagName.toLowerCase()
  const childTag = child.tagName.toLowerCase()

  if (parentTag === "body") return true
  if (parentTag === "ul" || parentTag === "ol") return childTag === "li"
  if (parentTag === "thead" || parentTag === "tbody" || parentTag === "tfoot") {
    return childTag === "tr"
  }
  if (parentTag === "tr") return childTag === "td" || childTag === "th"

  return new Set([
    "article",
    "aside",
    "blockquote",
    "details",
    "div",
    "figcaption",
    "figure",
    "footer",
    "header",
    "li",
    "main",
    "nav",
    "section",
    "td",
    "th",
  ]).has(parentTag)
}

export const Canvas = forwardRef<CanvasHandle, CanvasProps>(function Canvas(
  {
    mode,
    htmlFileHandle = null,
    projectDirHandle = null,
    onProjectDirHandleChange,
    onSelectionChange,
    onSelectionCountChange,
    onSelectionPathsChange,
    onSelectionStructureEditableChange,
    onOutlineChange,
    onCatalogChange,
    onCommit,
  },
  ref
) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const selectedElRef = useRef<Element | null>(null)
  const extraSelectedRef = useRef<Element[]>([])
  const editingElRef = useRef<HTMLElement | null>(null)
  const modeRef = useRef<EditorMode>(mode)
  const mediaPickContextRef = useRef<MediaPickContext>({
    htmlHandle: null,
    projectDirHandle: null,
  })
  const baseHrefRef = useRef<string | null>(null)
  const [selectBoxes, setSelectBoxes] = useState<SelectBoxOverlay[]>([])
  const [hoverBox, setHoverBox] = useState<Box | null>(null)
  const [pendingPastedImage, setPendingPastedImage] = useState<File | null>(
    null
  )
  const [pastedImageBusy, setPastedImageBusy] = useState(false)
  const [imageAnnotation, setImageAnnotation] = useState<{
    image: HTMLImageElement
    snapshot: ImageAnnotationSnapshot
  } | null>(null)

  const callbacksRef = useRef({
    onSelectionChange,
    onSelectionCountChange,
    onSelectionPathsChange,
    onSelectionStructureEditableChange,
    onOutlineChange,
    onCatalogChange,
    onCommit,
  })
  callbacksRef.current = {
    onSelectionChange,
    onSelectionCountChange,
    onSelectionPathsChange,
    onSelectionStructureEditableChange,
    onOutlineChange,
    onCatalogChange,
    onCommit,
  }

  mediaPickContextRef.current = {
    htmlHandle: htmlFileHandle,
    projectDirHandle,
  }

  const getDoc = useCallback((): Document | null => {
    return iframeRef.current?.contentDocument ?? null
  }, [])

  const getBody = useCallback((): HTMLElement | null => {
    return getDoc()?.body ?? null
  }, [getDoc])

  const rectToBox = (el: Element): Box => {
    const r = el.getBoundingClientRect()
    return { top: r.top, left: r.left, width: r.width, height: r.height }
  }

  const repositionSelectBoxes = useCallback(() => {
    if (modeRef.current === "view") {
      setSelectBoxes([])
      return
    }
    const primary = selectedElRef.current
    if (!primary || !primary.isConnected) {
      setSelectBoxes([])
      return
    }
    const overlays: SelectBoxOverlay[] = [
      {
        box: rectToBox(primary),
        isPrimary: true,
        isLocked: isElementLocked(primary),
      },
    ]
    for (const el of extraSelectedRef.current) {
      if (el.isConnected && el !== primary) {
        overlays.push({
          box: rectToBox(el),
          isPrimary: false,
          isLocked: isElementLocked(el),
        })
      }
    }
    setSelectBoxes(overlays)
  }, [])

  const emitOutline = useCallback(() => {
    const body = getBody()
    if (body) callbacksRef.current.onOutlineChange(buildOutline(body))
  }, [getBody])

  const emitCatalog = useCallback(() => {
    const doc = getDoc()
    if (doc) callbacksRef.current.onCatalogChange(harvestStyleCatalog(doc))
  }, [getDoc])

  const commit = useCallback(() => {
    const doc = getDoc()
    if (!doc) return
    callbacksRef.current.onCommit(serializeCleanDocument(doc))
    emitOutline()
    emitCatalog()
  }, [getDoc, emitOutline, emitCatalog])

  const focusCanvas = useCallback(() => {
    const iframe = iframeRef.current
    iframe?.contentWindow?.focus()
    iframe?.contentDocument?.body?.focus()
  }, [])

  const applyStyleToElement = (
    el: HTMLElement,
    prop: string,
    value: string
  ): boolean => {
    if (el.style.getPropertyValue(prop) === value) return false
    if (value === "") el.style.removeProperty(prop)
    else el.style.setProperty(prop, value)
    if (el.getAttribute("style") === "") el.removeAttribute("style")
    return true
  }

  const getAllSelectedElements = useCallback((): Element[] => {
    const primary = selectedElRef.current
    if (!primary) return []
    return [primary, ...extraSelectedRef.current.filter((e) => e !== primary)]
  }, [])

  const getStructureEditableSelection = useCallback((): Element[] => {
    const selected = getAllSelectedElements()
      .map(structureElementFor)
      .filter((el, i, all) => {
        return el.isConnected && all.indexOf(el) === i
      })
    if (selected.length === 0) return []
    if (selected.some((el) => !el.parentElement || isStructureLocked(el))) {
      return []
    }

    const parent = selected[0].parentElement
    if (!parent || !selected.every((el) => el.parentElement === parent)) {
      return []
    }

    const selectedSet = new Set(selected)
    return Array.from(parent.children).filter((child) => selectedSet.has(child))
  }, [getAllSelectedElements])

  const groupContiguousSiblings = (selected: Element[]): Element[][] => {
    const groups: Element[][] = []
    for (const el of selected) {
      const lastGroup = groups[groups.length - 1]
      const prev = el.previousElementSibling
      if (lastGroup && prev === lastGroup[lastGroup.length - 1]) {
        lastGroup.push(el)
      } else {
        groups.push([el])
      }
    }
    return groups
  }

  const emitSelectionStructureEditable = useCallback(() => {
    callbacksRef.current.onSelectionStructureEditableChange(
      getStructureEditableSelection().length > 0
    )
  }, [getStructureEditableSelection])

  const emitSelectionPaths = useCallback(
    (body: HTMLElement) => {
      callbacksRef.current.onSelectionPathsChange(
        getAllSelectedElements()
          .filter((el) => el.isConnected)
          .map((el) => getElementPath(el, body))
      )
    },
    [getAllSelectedElements]
  )

  const applySelectionState = useCallback(
    (primary: Element | null, extras: Element[]) => {
      const body = getBody()
      if (!primary || !body || primary === body) {
        selectedElRef.current = null
        extraSelectedRef.current = []
        setSelectBoxes([])
        callbacksRef.current.onSelectionChange(null)
        callbacksRef.current.onSelectionCountChange(0)
        callbacksRef.current.onSelectionPathsChange([])
        callbacksRef.current.onSelectionStructureEditableChange(false)
        return
      }
      selectedElRef.current = primary
      extraSelectedRef.current = extras.filter(
        (e) => e !== primary && e.isConnected
      )
      callbacksRef.current.onSelectionChange(buildSelectionInfo(primary, body))
      callbacksRef.current.onSelectionCountChange(
        countSelection(primary, extraSelectedRef.current)
      )
      emitSelectionPaths(body)
      emitSelectionStructureEditable()
      repositionSelectBoxes()
    },
    [
      getBody,
      emitSelectionPaths,
      emitSelectionStructureEditable,
      repositionSelectBoxes,
    ]
  )

  const selectElement = useCallback(
    (el: Element | null) => {
      applySelectionState(el, [])
      if (el) focusCanvas()
    },
    [applySelectionState, focusCanvas]
  )

  const toggleSelectElement = useCallback(
    (target: Element) => {
      const next = toggleSelectionMember(
        selectedElRef.current,
        extraSelectedRef.current,
        target
      )
      applySelectionState(next.primary, next.extras)
    },
    [applySelectionState]
  )

  const selectRangeToElement = useCallback(
    (target: Element) => {
      const primary = selectedElRef.current
      const parent = primary?.parentElement
      if (!primary || !parent || target.parentElement !== parent) {
        selectElement(target)
        return
      }

      const children = Array.from(parent.children)
      const start = children.indexOf(primary)
      const end = children.indexOf(target)
      if (start === -1 || end === -1) {
        selectElement(target)
        return
      }

      const [from, to] = start < end ? [start, end] : [end, start]
      const range = children.slice(from, to + 1)
      applySelectionState(
        target,
        range.filter((el) => el !== target)
      )
    },
    [applySelectionState, selectElement]
  )

  const isSelectedElement = useCallback((el: Element | null): boolean => {
    if (!el) return false
    return el === selectedElRef.current || extraSelectedRef.current.includes(el)
  }, [])

  const endTextEdit = useCallback(() => {
    const el = editingElRef.current
    if (!el) return
    el.removeAttribute("contenteditable")
    el.removeAttribute("spellcheck")
    editingElRef.current = null
    commit()
    repositionSelectBoxes()
  }, [commit, repositionSelectBoxes])

  const startTextEditInternal = useCallback(() => {
    const el = selectedElRef.current as HTMLElement | null
    const doc = getDoc()
    if (!el || !doc) return
    if (isElementLocked(el)) return
    editingElRef.current = el
    el.setAttribute("contenteditable", "true")
    el.setAttribute("spellcheck", "false")
    el.focus()
    const range = doc.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const sel = doc.defaultView?.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)

    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" ||
        (e.key === "Enter" && (e.metaKey || e.ctrlKey))
      ) {
        e.preventDefault()
        el.blur()
      }
    }
    const onBlur = () => {
      el.removeEventListener("keydown", onKeyDown)
      el.removeEventListener("blur", onBlur)
      endTextEdit()
    }
    el.addEventListener("keydown", onKeyDown)
    el.addEventListener("blur", onBlur)
  }, [getDoc, endTextEdit])

  const deleteSelectedInternal = useCallback(() => {
    const selected = getStructureEditableSelection()
    const body = getBody()
    if (selected.length === 0) return
    const first = selected[0]
    const last = selected[selected.length - 1]
    const next =
      (last.nextElementSibling as Element | null) ??
      (first.previousElementSibling as Element | null)
    for (const el of selected) el.remove()
    if (selected.length > 1) selectElement(null)
    else selectElement(next && next !== body ? selectionElementFor(next) : null)
    commit()
  }, [getBody, getStructureEditableSelection, selectElement, commit])

  const copySelectedInternal = useCallback(() => {
    const el = selectedElRef.current
    if (!el) return
    const html = serializeCleanElement(structureElementFor(el))
    setAppClipboard(html)
    void writeSystemClipboard(html)
  }, [])

  const cutSelectedInternal = useCallback(() => {
    const selected = selectedElRef.current
    if (!selected || isStructureLocked(structureElementFor(selected))) return
    copySelectedInternal()
    deleteSelectedInternal()
  }, [copySelectedInternal, deleteSelectedInternal])

  const insertPastedNode = useCallback(
    (node: Element) => {
      const doc = getDoc()
      const body = getBody()
      if (!doc || !body) return
      if (elementUsesLayoutStyles(node)) ensureLayoutStyles(doc)
      const anchor = selectedElRef.current
        ? structureElementFor(selectedElRef.current)
        : null
      if (anchor && anchor.parentElement && anchor !== body) {
        if (isElementLocked(anchor.parentElement)) return
        anchor.parentElement.insertBefore(node, anchor.nextSibling)
      } else {
        body.appendChild(node)
      }
      selectElement(node)
      commit()
    },
    [getDoc, getBody, selectElement, commit]
  )

  const pasteFromClipboardInternal = useCallback(
    (data?: DataTransfer | null) => {
      const doc = getDoc()
      if (!doc) return
      const node = buildPasteNode(doc, data)
      if (node) insertPastedNode(node)
    },
    [getDoc, insertPastedNode]
  )

  const insertPastedImage = useCallback(
    (file: File, source: { dataUrl: string } | { relativePath: string }) => {
      const doc = getDoc()
      if (!doc) return
      const img = doc.createElement("img")
      img.setAttribute("alt", "")
      if ("dataUrl" in source) img.setAttribute("src", source.dataUrl)
      else setMediaSourceWithPreview(img, source.relativePath, file)
      insertPastedNode(img)
    },
    [getDoc, insertPastedNode]
  )

  const embedPendingPastedImage = useCallback(async () => {
    const file = pendingPastedImage
    if (!file) return
    setPastedImageBusy(true)
    try {
      const dataUrl = await readFileAsDataUrl(file)
      insertPastedImage(file, { dataUrl })
      setPendingPastedImage(null)
    } catch (err) {
      toast.error("画像の埋め込みに失敗しました")
      console.error(err)
    } finally {
      setPastedImageBusy(false)
    }
  }, [insertPastedImage, pendingPastedImage])

  const savePendingPastedImage = useCallback(
    async (chooseDirectory: boolean) => {
      const file = pendingPastedImage
      if (!file) return
      setPastedImageBusy(true)
      try {
        const saved = await savePastedImageFile(
          file,
          mediaPickContextRef.current,
          chooseDirectory
        )
        if (!saved) return
        if (saved.projectDirHandle) {
          onProjectDirHandleChange?.(saved.projectDirHandle)
        }
        insertPastedImage(file, { relativePath: saved.relativePath })
        setPendingPastedImage(null)
        toast.success(`${saved.relativePath} に画像を保存しました`)
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : "画像ファイルの保存に失敗しました"
        )
        console.error(err)
      } finally {
        setPastedImageBusy(false)
      }
    },
    [insertPastedImage, onProjectDirHandleChange, pendingPastedImage]
  )

  const handlePasteEvent = useCallback(
    (e: ClipboardEvent) => {
      if (modeRef.current !== "edit") return
      if (editingElRef.current) return
      if (extraSelectedRef.current.length > 0) {
        e.preventDefault()
        return
      }
      const data = e.clipboardData
      const image = resolvePasteImage(data)
      if (image) {
        e.preventDefault()
        setPendingPastedImage(image)
        return
      }
      const html = resolvePasteHtml(data)
      const plain = resolvePastePlainText(data)
      if (!html && !plain) return
      e.preventDefault()
      pasteFromClipboardInternal(data)
    },
    [pasteFromClipboardInternal]
  )

  const handleClipboardShortcut = useCallback(
    (e: KeyboardEvent) => {
      if (modeRef.current !== "edit") return
      if (editingElRef.current) return
      const active =
        e.currentTarget === window
          ? document.activeElement
          : getDoc()?.activeElement
      if (
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          (active as HTMLElement).isContentEditable)
      ) {
        return
      }
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const key = e.key.toLowerCase()
      const multi = extraSelectedRef.current.length > 0
      if (key === "c") {
        if (!selectedElRef.current || multi) return
        e.preventDefault()
        copySelectedInternal()
      } else if (key === "x") {
        if (!selectedElRef.current || multi) return
        e.preventDefault()
        cutSelectedInternal()
      } else if (key === "v") {
        if (multi) {
          e.preventDefault()
        }
      }
    },
    [copySelectedInternal, cutSelectedInternal, getDoc]
  )

  const attachListeners = useCallback(
    (doc: Document) => {
      const body = doc.body

      const onPointerDown = (e: PointerEvent) => {
        if (modeRef.current !== "edit") return
        const target = e.target as Element | null
        const selectable = resolveSelectTarget(target, body)
        if (
          !selectable ||
          (selectable.tagName !== "VIDEO" && selectable.tagName !== "AUDIO")
        ) {
          return
        }
        e.preventDefault()
        if (editingElRef.current) endTextEdit()
        selectElement(selectable)
      }

      const onClick = (e: MouseEvent) => {
        const target = e.target as Element | null
        const anchor = target?.closest("a")
        if (anchor) e.preventDefault()
        const form = target?.closest("form")
        if (form) e.preventDefault()

        if (modeRef.current !== "edit") return

        if (editingElRef.current && editingElRef.current.contains(target))
          return
        if (editingElRef.current) endTextEdit()

        const selectable = resolveSelectTarget(target, body)
        if (!selectable) return
        e.stopPropagation()
        const summary = target?.closest("summary")
        if (summary && isElementLocked(summary)) e.preventDefault()
        if (e.metaKey || e.ctrlKey) {
          toggleSelectElement(selectable)
        } else if (e.shiftKey) {
          selectRangeToElement(selectable)
        } else {
          selectElement(selectable)
        }
      }

      const onDblClick = (e: MouseEvent) => {
        if (modeRef.current !== "edit") return
        const selectable = resolveSelectTarget(e.target as Element | null, body)
        if (!selectable) return
        e.preventDefault()
        selectElement(selectable)
        if (isElementLocked(selectable)) return
        const tag = selectable.tagName.toLowerCase()
        if (tag === "img" || tag === "video" || tag === "audio") return
        startTextEditInternal()
      }

      const onMouseMove = (e: MouseEvent) => {
        if (modeRef.current !== "edit") {
          setHoverBox(null)
          return
        }
        const selectable = resolveSelectTarget(e.target as Element | null, body)
        if (!selectable || isSelectedElement(selectable)) {
          setHoverBox(null)
          return
        }
        setHoverBox(rectToBox(selectable))
      }

      const onMouseLeave = () => setHoverBox(null)
      const onScroll = () => {
        repositionSelectBoxes()
        setHoverBox(null)
      }

      // details のネイティブ開閉(open 属性の変化)を履歴/dirty/オーバーレイに反映する
      // toggle はバブリングしないため capture で購読する
      const onToggle = (e: Event) => {
        if (modeRef.current !== "edit") return
        const target = e.target
        if (target instanceof Element && isElementLocked(target)) return
        commit()
        repositionSelectBoxes()
        if (selectedElRef.current) selectElement(selectedElRef.current)
      }

      const onKeyDown = (e: KeyboardEvent) => {
        if (modeRef.current !== "edit") return
        if (editingElRef.current) return
        const active = doc.activeElement
        if (
          active &&
          (active.tagName === "INPUT" ||
            active.tagName === "TEXTAREA" ||
            (active as HTMLElement).isContentEditable)
        ) {
          return
        }
        if (e.key === "Delete" || e.key === "Backspace") {
          if (getStructureEditableSelection().length === 0) return
          e.preventDefault()
          deleteSelectedInternal()
          return
        }
        handleClipboardShortcut(e)
      }

      const onMediaPlay = (e: Event) => {
        if (modeRef.current !== "edit") return
        const el = e.target
        if (el instanceof HTMLVideoElement || el instanceof HTMLAudioElement) {
          el.pause()
        }
      }

      doc.addEventListener("play", onMediaPlay, true)
      doc.addEventListener("pointerdown", onPointerDown, true)
      doc.addEventListener("click", onClick, true)
      doc.addEventListener("dblclick", onDblClick, true)
      doc.addEventListener("mousemove", onMouseMove, true)
      doc.addEventListener("mouseleave", onMouseLeave, true)
      doc.addEventListener("keydown", onKeyDown, true)
      doc.addEventListener("paste", handlePasteEvent, true)
      doc.addEventListener("toggle", onToggle, true)
      doc.defaultView?.addEventListener("scroll", onScroll, true)
    },
    [
      endTextEdit,
      repositionSelectBoxes,
      selectElement,
      toggleSelectElement,
      selectRangeToElement,
      isSelectedElement,
      startTextEditInternal,
      deleteSelectedInternal,
      getStructureEditableSelection,
      handleClipboardShortcut,
      handlePasteEvent,
      commit,
    ]
  )

  const hydrateDocumentAssetsAfterLoad = useCallback(
    async (doc: Document, context?: HydrateMediaContext) => {
      const hydrateContext = context ?? mediaPickContextRef.current
      await hydrateExternalStylesheetsAfterDocumentLoad(
        doc,
        hydrateContext,
        onProjectDirHandleChange
      )
      emitCatalog()
      await hydrateMediaAfterDocumentLoad(
        doc.body,
        hydrateContext,
        onProjectDirHandleChange
      )
      applyMediaPreviewToBody(doc.body)
      repositionSelectBoxes()
    },
    [emitCatalog, onProjectDirHandleChange, repositionSelectBoxes]
  )

  const loadHtml = useCallback(
    (html: string, options?: LoadHtmlOptions) => {
      const iframe = iframeRef.current
      if (!iframe) return
      const { persisted, effective } = resolveDocumentBaseHref(
        baseHrefRef.current,
        options
      )
      baseHrefRef.current = persisted
      if (options?.clearMediaPreviews) clearMediaPreviewRegistry()
      editingElRef.current = null
      selectedElRef.current = null
      extraSelectedRef.current = []
      setSelectBoxes([])
      setHoverBox(null)

      const doc = iframe.contentDocument
      if (!doc) return
      doc.open()
      doc.write(injectBaseHref(html, effective))
      doc.close()

      const style = doc.createElement("style")
      style.setAttribute(EDITOR_INJECTED_ATTR, "")
      style.textContent = `
        [contenteditable="true"] { outline: 2px solid #22c55e !important; outline-offset: 2px; border-radius: 2px; }
        [${ELEMENT_LOCKED_ATTR}] { outline: 1px dashed rgba(245,158,11,0.9) !important; outline-offset: 3px; }
        ::selection { background: rgba(59,130,246,0.25); }
        img { display: block; max-width: 100%; min-width: 160px; min-height: 90px; object-fit: contain; background: #f3f4f6; }
        video { display: block; max-width: 100%; min-width: 240px; min-height: 135px; background: #e5e7eb; }
        audio { display: block; width: 100%; min-width: 240px; min-height: 48px; }
      `
      doc.head.appendChild(style)

      doc.body.tabIndex = -1
      applyMediaPreviewToBody(doc.body)
      attachListeners(doc)
      callbacksRef.current.onSelectionChange(null)
      callbacksRef.current.onSelectionCountChange(0)
      callbacksRef.current.onSelectionPathsChange([])
      callbacksRef.current.onSelectionStructureEditableChange(false)
      emitOutline()
      emitCatalog()
      void hydrateDocumentAssetsAfterLoad(doc, options?.hydrateContext)
    },
    [attachListeners, emitOutline, emitCatalog, hydrateDocumentAssetsAfterLoad]
  )

  useEffect(() => {
    modeRef.current = mode
    if (mode === "view") {
      setHoverBox(null)
      setSelectBoxes([])
    } else {
      repositionSelectBoxes()
    }
  }, [mode, repositionSelectBoxes])

  // 親ウィンドウにフォーカスがある場合(アウトラインから選択した直後など)の Delete / クリップボード対応
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (modeRef.current !== "edit") return
      if (editingElRef.current) return
      const active = document.activeElement
      if (
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          (active as HTMLElement).isContentEditable)
      ) {
        return
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (getStructureEditableSelection().length === 0) return
        e.preventDefault()
        deleteSelectedInternal()
        return
      }
      handleClipboardShortcut(e)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [
    deleteSelectedInternal,
    getStructureEditableSelection,
    handleClipboardShortcut,
  ])

  useEffect(() => {
    window.addEventListener("paste", handlePasteEvent, true)
    return () => window.removeEventListener("paste", handlePasteEvent, true)
  }, [handlePasteEvent])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    const ro = new ResizeObserver(() => repositionSelectBoxes())
    ro.observe(iframe)
    const onWinResize = () => repositionSelectBoxes()
    window.addEventListener("resize", onWinResize)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", onWinResize)
    }
  }, [repositionSelectBoxes])

  useImperativeHandle(
    ref,
    (): CanvasHandle => ({
      loadHtml,
      getCleanHtml: () => {
        const doc = getDoc()
        return doc ? serializeCleanDocument(doc) : ""
      },
      getCleanHtmlForSource: () => {
        const doc = getDoc()
        if (!doc) return { html: "", scrollOffset: null }
        const el = selectedElRef.current
        let anchor: Comment | null = null
        if (el?.parentNode) {
          anchor = doc.createComment(SOURCE_SCROLL_ANCHOR_TEXT)
          el.parentNode.insertBefore(anchor, el)
        }
        const raw = serializeCleanDocument(doc)
        if (anchor) anchor.remove()
        return stripSourceScrollAnchor(raw)
      },
      selectByPath: (path, mode = "replace") => {
        const body = getBody()
        if (!body) return
        const el = resolveElementPath(path, body)
        if (el && mode === "add") toggleSelectElement(el)
        else if (el && mode === "range") selectRangeToElement(el)
        else selectElement(el)
        el?.scrollIntoView({ block: "nearest", behavior: "smooth" })
      },
      clearSelection: () => selectElement(null),
      insertBlock: (blockHtml) => {
        const doc = getDoc()
        const body = getBody()
        if (!doc || !body) return
        const node = createCustomHtmlElement(doc, blockHtml)
        if (!node) return
        if (elementUsesLayoutStyles(node)) ensureLayoutStyles(doc)
        const anchor = selectedElRef.current
          ? structureElementFor(selectedElRef.current)
          : null
        if (anchor && anchor.parentElement && anchor !== body) {
          if (isElementLocked(anchor.parentElement)) return
          anchor.parentElement.insertBefore(node, anchor.nextSibling)
        } else {
          body.appendChild(node)
        }
        applyMediaPreview(node)
        selectElement(node)
        commit()
      },
      getSelectedHtml: () => {
        const el = selectedElRef.current
        if (!el || extraSelectedRef.current.length > 0) return null
        return serializeCleanElement(el)
      },
      replaceSelectedHtml: (html) => {
        const doc = getDoc()
        if (!doc) return false
        const source = selectedElRef.current
        if (
          !source ||
          extraSelectedRef.current.length > 0 ||
          isStructureLocked(source)
        ) {
          return false
        }
        const parent = source.parentElement
        if (!parent || isElementLocked(parent)) return false
        const node = createCustomHtmlElement(doc, html)
        if (!node) return false
        if (
          imageAnnotationWrapper(source) &&
          node.tagName.toLowerCase() !== "img"
        ) {
          return false
        }
        if (!canAcceptMovedChild(parent, node)) return false
        if (elementUsesLayoutStyles(node)) ensureLayoutStyles(doc)
        applyMediaPreview(node)
        node.querySelectorAll("img, video, audio").forEach(applyMediaPreview)
        parent.replaceChild(node, source)
        selectElement(node)
        repositionSelectBoxes()
        commit()
        return true
      },
      deleteSelected: () => deleteSelectedInternal(),
      moveSelected: (dir) => {
        const selected = getStructureEditableSelection()
        if (selected.length === 0) return
        const selectedSet = new Set(selected)
        let changed = false
        if (dir === "up") {
          for (const el of selected) {
            const prev = el.previousElementSibling
            if (prev && !selectedSet.has(prev)) {
              el.parentElement?.insertBefore(el, prev)
              changed = true
            }
          }
        } else {
          for (const el of [...selected].reverse()) {
            const next = el.nextElementSibling
            if (next && !selectedSet.has(next)) {
              el.parentElement?.insertBefore(next, el)
              changed = true
            }
          }
        }
        if (!changed) return
        const primary = selectedElRef.current
        repositionSelectBoxes()
        if (primary) applySelectionState(primary, extraSelectedRef.current)
        commit()
      },
      moveElement: (path, targetPath, placement) => {
        const body = getBody()
        if (!body) return
        const resolvedSource = resolveElementPath(path, body)
        const resolvedTarget = resolveElementPath(targetPath, body)
        const source = resolvedSource
          ? structureElementFor(resolvedSource)
          : null
        const target = resolvedTarget
          ? structureElementFor(resolvedTarget)
          : null
        if (!source || !target || source === target) return
        if (isStructureLocked(source)) return
        if (source.contains(target)) return

        if (placement === "inside") {
          if (isElementLocked(target)) return
          if (!canAcceptMovedChild(target, source)) return
          target.appendChild(source)
          selectElement(selectionElementFor(source))
          repositionSelectBoxes()
          commit()
          return
        }

        const parent = target.parentElement
        if (!parent) return
        if (isElementLocked(parent)) return
        if (!canAcceptMovedChild(parent, source)) return

        if (placement === "before" && source.nextElementSibling === target)
          return
        if (placement === "after" && target.nextElementSibling === source)
          return

        const anchor = placement === "before" ? target : target.nextSibling
        parent.insertBefore(source, anchor)
        selectElement(selectionElementFor(source))
        repositionSelectBoxes()
        commit()
      },
      duplicateSelected: () => {
        const selected = getStructureEditableSelection()
        if (selected.length === 0) return
        const clones: Element[] = []
        for (const group of groupContiguousSiblings(selected)) {
          const parent = group[0].parentElement
          const anchor = group[group.length - 1].nextSibling
          for (const el of group) {
            const clone = el.cloneNode(true) as Element
            parent?.insertBefore(clone, anchor)
            clones.push(clone)
          }
        }
        if (clones.length === 1) {
          selectElement(selectionElementFor(clones[0]))
        } else {
          const selectable = clones.map(selectionElementFor)
          applySelectionState(
            selectable[selectable.length - 1],
            selectable.slice(0, -1)
          )
        }
        commit()
      },
      copySelected: () => copySelectedInternal(),
      cutSelected: () => cutSelectedInternal(),
      pasteFromClipboard: (data) => pasteFromClipboardInternal(data),
      startTextEdit: () => startTextEditInternal(),
      applyFormat: (command) => {
        const el = selectedElRef.current as HTMLElement | null
        const doc = getDoc()
        if (!el || !doc) return
        if (isElementLocked(el)) return
        const win = doc.defaultView
        const sel = win?.getSelection() ?? null

        // 選択範囲が編集中要素の内部にある場合はその範囲、無ければ要素全体を対象にする
        const liveRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null
        const hasTextSelection =
          !!liveRange &&
          !liveRange.collapsed &&
          el.contains(liveRange.startContainer) &&
          el.contains(liveRange.endContainer)

        let range: Range
        if (hasTextSelection && liveRange) {
          range = liveRange
        } else {
          range = doc.createRange()
          range.selectNodeContents(el)
        }

        if (command === "link") {
          const url = window.prompt(
            "リンク先 URL を入力してください",
            "https://"
          )
          if (!url) return
          wrapRangeWithTag(doc, range, "a", { href: url })
        } else {
          const tag = FORMAT_TAG[command]
          if (!hasTextSelection && el.tagName.toLowerCase() === tag) {
            // 選択要素自身がこの書式タグ → トグル解除
            const parent = el.parentElement
            unwrapElement(el)
            selectElement(parent && parent !== getBody() ? parent : null)
          } else {
            // 要素全体が既にこの書式で包まれていればトグル解除
            const onlyChild =
              !hasTextSelection &&
              el.children.length === 1 &&
              el.firstElementChild?.tagName.toLowerCase() === tag &&
              el.firstElementChild?.textContent === el.textContent
                ? (el.firstElementChild as HTMLElement)
                : null
            if (onlyChild) {
              unwrapElement(onlyChild)
            } else {
              wrapRangeWithTag(doc, range, tag)
            }
          }
        }
        sel?.removeAllRanges()
        commit()
        repositionSelectBoxes()
      },
      chooseMediaSource: async () => {
        const el = selectedElRef.current
        if (!el) return
        if (isElementLocked(el)) return
        const tag = el.tagName.toLowerCase()
        const accept =
          tag === "img"
            ? "image/*"
            : tag === "video"
              ? "video/*"
              : tag === "audio"
                ? "audio/*"
                : null
        if (!accept) return

        const picked = await pickMediaFile(accept, mediaPickContextRef.current)
        if (!picked) return
        if (picked.projectDirHandle) {
          onProjectDirHandleChange?.(picked.projectDirHandle)
        }
        setMediaSourceWithPreview(el, picked.relativePath, picked.file)
        repositionSelectBoxes()
        commit()
      },
      chooseImageAsDataUrl: async () => {
        const el = selectedElRef.current
        if (!el) return
        if (isElementLocked(el)) return
        if (el.tagName.toLowerCase() !== "img") return

        const picked = await pickImageAsDataUrl()
        if (!picked) return
        el.removeAttribute(EDITOR_MEDIA_SRC_ATTR)
        el.setAttribute("src", picked.dataUrl)
        repositionSelectBoxes()
        commit()
        selectElement(el)
      },
      openImageAnnotationEditor: () => {
        const el = selectedElRef.current
        if (el?.tagName.toLowerCase() !== "img") return
        if (isElementLocked(el)) return
        const image = el as HTMLImageElement
        setImageAnnotation({ image, snapshot: imageAnnotationSnapshot(image) })
      },
      setSelectedImageDisplayWidth: (value) => {
        const el = selectedElRef.current as HTMLElement | null
        if (!el || el.tagName.toLowerCase() !== "img") return
        if (isElementLocked(el)) return
        const wrapper = imageAnnotationWrapper(el)
        let changed = false
        if (wrapper) {
          changed = applyStyleToElement(wrapper, "width", value) || changed
          changed =
            applyStyleToElement(el, "width", value ? "100%" : "") || changed
        } else {
          changed = applyStyleToElement(el, "width", value)
        }
        if (!changed) return
        commit()
        selectElement(el)
        repositionSelectBoxes()
      },
      setBooleanAttributeOnSelected: (name, enabled) => {
        const el = selectedElRef.current
        if (!el) return
        if (isElementLocked(el)) return
        const has = el.hasAttribute(name)
        if (enabled === has) return
        if (enabled) el.setAttribute(name, "")
        else el.removeAttribute(name)
        commit()
        selectElement(el)
        repositionSelectBoxes()
      },
      tableOp: (op) => {
        const el = selectedElRef.current
        const doc = getDoc()
        if (!el || !doc) return
        if (isElementLocked(el)) return
        const next = applyTableOp(doc, el, op)
        if (!next) return
        selectElement(next)
        commit()
      },
      columnOp: (op) => {
        const el = selectedElRef.current
        const doc = getDoc()
        if (!el || !doc) return
        if (isElementLocked(el)) return
        const next = applyColumnOp(doc, el, op)
        if (!next) return
        selectElement(next)
        commit()
      },
      setGridColumnCount: (count) => {
        const el = selectedElRef.current
        if (!el) return
        if (isElementLocked(el)) return
        const grid = setGridColumnCount(el, count)
        if (!grid) return
        selectElement(grid)
        commit()
      },
      setAttributeOnSelected: (name, value) => {
        const el = selectedElRef.current
        if (!el) return
        if (isElementLocked(el)) return
        const tag = el.tagName.toLowerCase()
        const isMedia = tag === "img" || tag === "video" || tag === "audio"
        const compareValue =
          isMedia && name === "src"
            ? (el.getAttribute(EDITOR_MEDIA_SRC_ATTR) ??
              el.getAttribute("src") ??
              "")
            : (el.getAttribute(name) ?? "")
        if (compareValue === value) return
        if (value === "") {
          el.removeAttribute(name)
          if (isMedia && name === "src") {
            el.removeAttribute(EDITOR_MEDIA_SRC_ATTR)
          }
        } else {
          el.setAttribute(name, value)
          if (isMedia && name === "src") {
            el.setAttribute(EDITOR_MEDIA_SRC_ATTR, value)
            applyMediaPreview(el)
          }
        }
        commit()
        const body = getBody()
        if (body) selectElement(el)
        repositionSelectBoxes()
      },
      setStyleOnSelected: (prop, value) => {
        const el = selectedElRef.current as HTMLElement | null
        if (!el) return
        if (isElementLocked(el)) return
        if (!applyStyleToElement(el, prop, value)) return
        commit()
        selectElement(el)
        repositionSelectBoxes()
      },
      setStyleOnSelection: (prop, value) => {
        const all = getAllSelectedElements()
        if (all.length === 0) return
        if (all.some((el) => isElementLocked(el))) return
        let changed = false
        for (const el of all) {
          if (applyStyleToElement(el as HTMLElement, prop, value))
            changed = true
        }
        if (!changed) return
        commit()
        const primary = selectedElRef.current
        if (primary) {
          applySelectionState(primary, extraSelectedRef.current)
        }
      },
      setDetailsOpen: (open) => {
        const details = selectedElRef.current?.closest("details")
        if (!details) return
        if (isElementLocked(details)) return
        if (open === details.hasAttribute("open")) return
        if (open) details.setAttribute("open", "")
        else details.removeAttribute("open")
        commit()
        if (selectedElRef.current) selectElement(selectedElRef.current)
        repositionSelectBoxes()
      },
      setLockedOnSelected: (locked) => {
        const el = selectedElRef.current
        if (!el) return
        if (locked) el.setAttribute(ELEMENT_LOCKED_ATTR, "")
        else el.removeAttribute(ELEMENT_LOCKED_ATTR)
        commit()
        selectElement(el)
        repositionSelectBoxes()
      },
    }),
    [
      loadHtml,
      getDoc,
      getBody,
      selectElement,
      toggleSelectElement,
      selectRangeToElement,
      applySelectionState,
      getAllSelectedElements,
      getStructureEditableSelection,
      commit,
      repositionSelectBoxes,
      startTextEditInternal,
      deleteSelectedInternal,
      copySelectedInternal,
      cutSelectedInternal,
      pasteFromClipboardInternal,
      onProjectDirHandleChange,
    ]
  )

  return (
    <div className="relative h-full w-full overflow-hidden bg-muted/40">
      <iframe
        ref={iframeRef}
        title="spec-canvas"
        sandbox="allow-same-origin"
        className="h-full w-full border-0 bg-white"
      />
      {hoverBox && mode === "edit" && (
        <div
          className="pointer-events-none absolute z-10 rounded-xs border border-dashed border-blue-400/70"
          style={{
            top: hoverBox.top,
            left: hoverBox.left,
            width: hoverBox.width,
            height: hoverBox.height,
          }}
        />
      )}
      {mode === "edit" &&
        selectBoxes.map((overlay, i) => (
          <div
            key={i}
            className={
              overlay.isPrimary
                ? "pointer-events-none absolute z-20 rounded-xs border-2 border-blue-500"
                : "pointer-events-none absolute z-[19] rounded-xs border-2 border-sky-400/80"
            }
            style={{
              top: overlay.box.top,
              left: overlay.box.left,
              width: overlay.box.width,
              height: overlay.box.height,
            }}
          >
            {overlay.isLocked && (
              <span className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-sm border border-amber-300 bg-amber-100 text-amber-700 shadow-sm">
                <Lock className="size-3" aria-hidden />
              </span>
            )}
          </div>
        ))}
      <PasteImageDialog
        file={pendingPastedImage}
        canSaveFile={!!htmlFileHandle && supportsDirectoryPicker()}
        busy={pastedImageBusy}
        onCancel={() => setPendingPastedImage(null)}
        onEmbed={() => void embedPendingPastedImage()}
        onSave={(chooseDirectory) =>
          void savePendingPastedImage(chooseDirectory)
        }
      />
      <ImageAnnotationDialog
        snapshot={imageAnnotation?.snapshot ?? null}
        onCancel={() => setImageAnnotation(null)}
        onApply={(svg, width, height) => {
          const image = imageAnnotation?.image
          if (!image?.isConnected) {
            setImageAnnotation(null)
            return
          }
          if (!applyImageAnnotation(image, svg, width, height)) return
          ensureLayoutStyles(image.ownerDocument)
          setImageAnnotation(null)
          selectElement(image)
          repositionSelectBoxes()
          commit()
        }}
      />
    </div>
  )
})
