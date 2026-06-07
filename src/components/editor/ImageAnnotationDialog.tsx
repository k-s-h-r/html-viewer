import { useEffect, useRef, useState } from "react"
import {
  Circle,
  Minus,
  MousePointer2,
  Redo2,
  Square,
  Trash2,
  Undo2,
} from "lucide-react"
import SvgCanvas from "@svgedit/svgcanvas"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ImageAnnotationSnapshot } from "@/editor/imageAnnotation"

type Tool = "select" | "rect" | "ellipse" | "line"

const DEFAULT_STROKE = "#ef4444"
const DEFAULT_STROKE_WIDTH = 4

interface SvgCanvasControls extends SvgCanvas {
  undoMgr: SvgCanvas["undoMgr"] & {
    undo: () => void
    redo: () => void
  }
  bind: (event: string, callback: (window: Window, args?: unknown) => void) => void
  getSelectedElements: () => (Element | null)[]
  updateCanvas: (width: number, height: number) => void
  setCurrentZoom: (zoom: number) => void
  setBackground: (color: string, url?: string) => void
  setColor: (type: "fill" | "stroke", value: string) => void
  setStrokeWidth: (width: number) => void
}

interface ImageAnnotationDialogProps {
  snapshot: ImageAnnotationSnapshot | null
  onCancel: () => void
  onApply: (svg: string, width: number, height: number) => void
}

function toolButtonVariant(tool: Tool, current: Tool) {
  return tool === current ? "secondary" : "outline"
}

function runUndoWhenReady(
  canvas: SvgCanvasControls | null,
  started = Date.now()
) {
  if (!canvas) return
  if (canvas.undoMgr.getUndoStackSize() > 0 || Date.now() - started > 500) {
    canvas.undoMgr.undo()
    return
  }
  window.setTimeout(() => runUndoWhenReady(canvas, started), 50)
}

function redoAnnotation(canvas: SvgCanvasControls | null) {
  canvas?.undoMgr.redo()
}

function normalizeHexColor(value: string | null): string | null {
  if (!value || value === "none") return null
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase()
  if (/^[0-9a-f]{6}$/i.test(value)) return `#${value.toLowerCase()}`
  return null
}

function numericStrokeWidth(value: string | null): number | null {
  if (!value) return null
  const width = Number.parseFloat(value)
  return Number.isFinite(width) && width > 0 ? width : null
}

export function ImageAnnotationDialog({
  snapshot,
  onCancel,
  onApply,
}: ImageAnnotationDialogProps) {
  const textInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<SvgCanvasControls | null>(null)
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [stage, setStage] = useState<HTMLDivElement | null>(null)
  const [tool, setTool] = useState<Tool>("select")
  const [stroke, setStroke] = useState(DEFAULT_STROKE)
  const [fill, setFill] = useState("#ffffff")
  const [transparentFill, setTransparentFill] = useState(true)
  const [strokeWidth, setStrokeWidth] = useState(DEFAULT_STROKE_WIDTH)

  useEffect(() => {
    if (!snapshot || !container || !stage) return
    container.replaceChildren()

    const canvas = new SvgCanvas(container, {
      dimensions: [snapshot.width, snapshot.height],
      initFill: { color: "none", opacity: 1 },
      initStroke: {
        color: DEFAULT_STROKE.slice(1),
        opacity: 1,
        width: DEFAULT_STROKE_WIDTH,
      },
      initOpacity: 1,
      imgPath: "",
      baseUnit: "px",
      selectNew: true,
      show_outside_canvas: false,
      text: {
        stroke_width: 0,
        font_size: 24,
        font_family: "sans-serif",
      },
    }) as SvgCanvasControls

    canvas.setSvgString(snapshot.svg, true)
    canvas.undoMgr.resetUndoStack()
    canvas.setBackground("#ffffff", snapshot.imageUrl)
    if (textInputRef.current) canvas.textActions.setInputElem(textInputRef.current)
    canvasRef.current = canvas

    const syncStyleFromSelection = () => {
      const selected = canvas.getSelectedElements().find(Boolean)
      if (!selected) return
      const selectedStroke = normalizeHexColor(selected.getAttribute("stroke"))
      const selectedFill = normalizeHexColor(selected.getAttribute("fill"))
      const selectedStrokeWidth = numericStrokeWidth(
        selected.getAttribute("stroke-width")
      )
      if (selectedStroke) setStroke(selectedStroke)
      if (selectedStrokeWidth) setStrokeWidth(selectedStrokeWidth)
      if (selected.getAttribute("fill") === "none") {
        setTransparentFill(true)
      } else if (selectedFill) {
        setFill(selectedFill)
        setTransparentFill(false)
      }
    }
    canvas.bind("selected", syncStyleFromSelection)
    canvas.bind("changed", syncStyleFromSelection)

    const fit = () => {
      const width = stage.clientWidth
      const height = stage.clientHeight
      if (!width || !height) return
      const zoom = Math.min(width / snapshot.width, height / snapshot.height)
      canvas.setCurrentZoom(zoom)
      canvas.updateCanvas(width, height)
    }
    const observer = new ResizeObserver(fit)
    observer.observe(stage)
    fit()

    return () => {
      observer.disconnect()
      canvas.clearSelection()
      container.replaceChildren()
      canvasRef.current = null
    }
  }, [container, snapshot, stage])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setMode(tool)
  }, [tool])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setColor("stroke", stroke)
  }, [stroke])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setColor("fill", transparentFill ? "none" : fill)
  }, [fill, transparentFill])

  useEffect(() => {
    canvasRef.current?.setStrokeWidth(strokeWidth)
  }, [strokeWidth])

  const chooseTool = (next: Tool) => {
    setTool(next)
    canvasRef.current?.setMode(next)
  }

  if (!snapshot) return null

  return (
    <Dialog
      open
      disablePointerDismissal
      onOpenChange={(open) => !open && onCancel()}
    >
      <DialogContent
        className="grid h-[min(90vh,900px)] max-w-[min(96vw,1280px)] grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-3 sm:max-w-[min(96vw,1280px)]"
        showCloseButton={false}
        onKeyDown={(e) => {
          const target = e.target as HTMLElement
          const isInput =
            target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable
          if (!isInput && (e.key === "Delete" || e.key === "Backspace")) {
            e.preventDefault()
            canvasRef.current?.deleteSelectedElements()
          } else if (!isInput && (e.metaKey || e.ctrlKey) && e.key === "z") {
            e.preventDefault()
            if (e.shiftKey) redoAnnotation(canvasRef.current)
            else runUndoWhenReady(canvasRef.current)
          }
          e.stopPropagation()
        }}
      >
        <DialogHeader>
          <DialogTitle>画像上の図形を編集</DialogTitle>
          <DialogDescription>
            四角、丸、線を選び、画像上をドラッグして描画します。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2">
          <Button
            variant={toolButtonVariant("select", tool)}
            size="sm"
            data-testid="annotation-tool-select"
            onClick={() => chooseTool("select")}
          >
            <MousePointer2 /> 選択
          </Button>
          <Button
            variant={toolButtonVariant("rect", tool)}
            size="sm"
            data-testid="annotation-tool-rect"
            onClick={() => chooseTool("rect")}
          >
            <Square /> 四角
          </Button>
          <Button
            variant={toolButtonVariant("ellipse", tool)}
            size="sm"
            data-testid="annotation-tool-ellipse"
            onClick={() => chooseTool("ellipse")}
          >
            <Circle /> 丸
          </Button>
          <Button
            variant={toolButtonVariant("line", tool)}
            size="sm"
            data-testid="annotation-tool-line"
            onClick={() => chooseTool("line")}
          >
            <Minus /> 線
          </Button>

          <div className="mx-1 h-6 w-px bg-border" />

          <Button
            variant="outline"
            size="icon-sm"
            title="元に戻す"
            data-testid="annotation-undo"
            onClick={() => runUndoWhenReady(canvasRef.current)}
          >
            <Undo2 />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            title="やり直す"
            data-testid="annotation-redo"
            onClick={() => redoAnnotation(canvasRef.current)}
          >
            <Redo2 />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            title="選択した図形を削除"
            data-testid="annotation-delete"
            onClick={() => canvasRef.current?.deleteSelectedElements()}
          >
            <Trash2 />
          </Button>

          <div className="mx-1 h-6 w-px bg-border" />

          <div className="flex items-center gap-1.5">
            <Label className="text-xs" htmlFor="annotation-stroke">
              線
            </Label>
            <Input
              id="annotation-stroke"
              type="color"
              className="h-7 w-9 px-1"
              value={stroke}
              onChange={(e) => setStroke(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Label className="text-xs" htmlFor="annotation-stroke-width">
              太さ
            </Label>
            <Input
              id="annotation-stroke-width"
              type="number"
              min={1}
              max={40}
              className="h-7 w-16"
              value={strokeWidth}
              onChange={(e) =>
                setStrokeWidth(Math.max(1, Number(e.target.value) || 1))
              }
            />
          </div>
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={transparentFill}
              onChange={(e) => setTransparentFill(e.target.checked)}
            />
            塗りなし
          </label>
          {!transparentFill && (
            <Input
              aria-label="塗り色"
              type="color"
              className="h-7 w-9 px-1"
              value={fill}
              onChange={(e) => setFill(e.target.value)}
            />
          )}
        </div>

        <div
          ref={setStage}
          className="min-h-0 overflow-hidden rounded-lg border bg-muted"
          data-testid="annotation-stage"
        >
          <div
            ref={setContainer}
            className="h-full w-full [&>svg]:block"
            data-testid="annotation-canvas"
          />
          <input
            ref={textInputRef}
            className="pointer-events-none absolute size-0 opacity-0"
            tabIndex={-1}
            aria-hidden
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            キャンセル
          </Button>
          <Button
            data-testid="annotation-apply"
            onClick={() => {
              const canvas = canvasRef.current
              if (!canvas) return
              canvas.clearSelection()
              onApply(canvas.getSvgString(), snapshot.width, snapshot.height)
            }}
          >
            適用
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
