import {
  Code,
  Eye,
  FilePlus2,
  FolderOpen,
  Pencil,
  Redo2,
  Save,
  SaveAll,
  Undo2,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { EditorMode } from "@/editor/types"

interface ToolbarProps {
  fileName: string | null
  dirty: boolean
  mode: EditorMode
  hasDocument: boolean
  canUndo: boolean
  canRedo: boolean
  fsaSupported: boolean
  hostMode?: boolean
  onNew: () => void
  onOpen: () => void
  onSave: () => void
  onSaveAs: () => void
  onUndo: () => void
  onRedo: () => void
  onModeChange: (mode: EditorMode) => void
  onExit?: () => void
}

export function Toolbar({
  fileName,
  dirty,
  mode,
  hasDocument,
  canUndo,
  canRedo,
  fsaSupported,
  hostMode = false,
  onNew,
  onOpen,
  onSave,
  onSaveAs,
  onUndo,
  onRedo,
  onModeChange,
  onExit,
}: ToolbarProps) {
  const historyDisabled = mode === "source"

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3">
      <div className="flex items-center gap-1.5 pr-1 font-semibold">
        <span className="text-sm">HTML仕様書エディター</span>
      </div>
      <Separator orientation="vertical" className="mx-1 h-6 data-vertical:self-auto" />

      {!hostMode ? (
        <>
          <Button variant="ghost" size="sm" onClick={onNew} data-testid="tb-new">
            <FilePlus2 /> 新規
          </Button>
          <Button variant="ghost" size="sm" onClick={onOpen} data-testid="tb-open">
            <FolderOpen /> 開く
          </Button>
        </>
      ) : null}
      <Button
        variant={dirty ? "default" : "ghost"}
        size="sm"
        disabled={!hasDocument}
        onClick={onSave}
        data-testid="tb-save"
      >
        <Save /> 保存
      </Button>
      {!hostMode ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={!hasDocument}
          onClick={onSaveAs}
          data-testid="tb-save-as"
        >
          <SaveAll /> 別名保存
        </Button>
      ) : null}

      <Separator orientation="vertical" className="mx-1 h-6 data-vertical:self-auto" />

      <Button
        variant="ghost"
        size="icon-sm"
        disabled={!canUndo || historyDisabled}
        title="元に戻す"
        onClick={onUndo}
        data-testid="tb-undo"
      >
        <Undo2 />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={!canRedo || historyDisabled}
        title="やり直し"
        onClick={onRedo}
        data-testid="tb-redo"
      >
        <Redo2 />
      </Button>

      <Separator orientation="vertical" className="mx-1 h-6 data-vertical:self-auto" />

      <ToggleGroup
        value={[mode]}
        onValueChange={(values) => {
          const next = values[values.length - 1] as EditorMode | undefined
          if (next) onModeChange(next)
        }}
        disabled={!hasDocument}
        variant="outline"
        size="sm"
        spacing={0}
      >
        <ToggleGroupItem value="edit" data-testid="tb-mode-edit">
          <Pencil /> 編集
        </ToggleGroupItem>
        {!hostMode ? (
          <ToggleGroupItem value="view" data-testid="tb-mode-view">
            <Eye /> 閲覧
          </ToggleGroupItem>
        ) : null}
        <ToggleGroupItem value="source" data-testid="tb-mode-source">
          <Code /> ソース
        </ToggleGroupItem>
      </ToggleGroup>

      <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
        {onExit ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onExit}
            data-testid="tb-exit"
          >
            <X /> 終了
          </Button>
        ) : null}
        {!fsaSupported && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            保存はダウンロードになります
          </span>
        )}
        {fileName && (
          <span className="max-w-[220px] truncate font-medium text-foreground">
            {fileName}
            {dirty && (
              <span
                className="ml-1 text-amber-500"
                data-testid="tb-dirty-indicator"
              >
                ●
              </span>
            )}
          </span>
        )}
      </div>
    </header>
  )
}
