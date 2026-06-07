import { useState } from "react"
import {
  DndContext,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core"
import {
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsRight,
  Lock,
} from "lucide-react"

import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { ElementPath, OutlineNode } from "@/editor/types"

type DropPlacement = "before" | "after" | "inside"

interface DropTarget {
  id: string
  path: ElementPath
  placement: DropPlacement
}

function pathsEqual(a: ElementPath | null, b: ElementPath | null) {
  if (!a || !b) return false
  if (a.length !== b.length) return false
  return a.every((v, i) => v === b[i])
}

function pathKey(path: ElementPath): string {
  return path.join(".")
}

function dragId(path: ElementPath): string {
  return `outline-drag:${pathKey(path)}`
}

function dropId(path: ElementPath, placement: DropPlacement): string {
  return `outline-drop:${pathKey(path)}:${placement}`
}

function pathStartsWith(path: ElementPath, prefix: ElementPath): boolean {
  if (path.length <= prefix.length) return false
  return prefix.every((v, i) => path[i] === v)
}

function canDropOnTarget(
  source: ElementPath,
  target: ElementPath,
  placement: DropPlacement
): boolean {
  if (pathsEqual(source, target)) return false
  if (placement === "inside") return !pathStartsWith(target, source)
  return !pathStartsWith(target, source)
}

interface OutlinePanelProps {
  nodes: OutlineNode[]
  selectedPath: ElementPath | null
  selectedPaths: ElementPath[]
  collapsedPaths: Set<string>
  disabled?: boolean
  onToggleCollapse: (path: ElementPath) => void
  onExpandAll: () => void
  onCollapseAll: () => void
  onMoveElement: (
    path: ElementPath,
    targetPath: ElementPath,
    placement: DropPlacement
  ) => void
  onSelect: (path: ElementPath, mode: "replace" | "add" | "range") => void
}

function DropZone({
  node,
  placement,
  active,
  disabled,
}: {
  node: OutlineNode
  placement: DropPlacement
  active: boolean
  disabled: boolean
}) {
  const { setNodeRef } = useDroppable({
    id: dropId(node.path, placement),
    data: {
      path: node.path,
      placement,
    },
    disabled,
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "pointer-events-none absolute inset-x-0",
        placement === "before" && "top-0 h-[20%]",
        placement === "inside" && "top-[20%] bottom-[20%]",
        placement === "after" && "bottom-0 h-[20%]"
      )}
      aria-hidden
    >
      {active && (
        <>
          {placement === "inside" ? (
            <div className="absolute inset-x-1 inset-y-0 rounded-sm ring-2 ring-primary/70" />
          ) : (
            <div
              className={cn(
                "absolute right-1 left-1 h-0.5 rounded-full bg-primary",
                placement === "before" ? "top-0" : "bottom-0"
              )}
            />
          )}
        </>
      )}
    </div>
  )
}

function OutlineRow({
  node,
  depth,
  selectedPath,
  selectedPaths,
  disabled,
  collapsedPaths,
  activeDropTarget,
  activeDragPath,
  dragDisabled,
  onToggleCollapse,
  onSelect,
}: {
  node: OutlineNode
  depth: number
  selectedPath: ElementPath | null
  selectedPaths: ElementPath[]
  disabled?: boolean
  collapsedPaths: Set<string>
  activeDropTarget: DropTarget | null
  activeDragPath: ElementPath | null
  dragDisabled: boolean
  onToggleCollapse: (path: ElementPath) => void
  onSelect: (path: ElementPath, mode: "replace" | "add" | "range") => void
}) {
  const key = pathKey(node.path)
  const hasChildren = node.children.length > 0
  const collapsed = hasChildren && collapsedPaths.has(key)
  const visibleTextPreview =
    hasChildren && !collapsed ? node.directTextPreview : node.textPreview
  const draggableDisabled = disabled || dragDisabled || node.isLocked
  const beforeAfterDropDisabled =
    !activeDragPath ||
    pathsEqual(activeDragPath, node.path) ||
    pathStartsWith(node.path, activeDragPath)
  const insideDropDisabled =
    !activeDragPath ||
    pathsEqual(activeDragPath, node.path) ||
    pathStartsWith(node.path, activeDragPath)
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: dragId(node.path),
      data: {
        path: node.path,
      },
      disabled: draggableDisabled,
    })
  const isPrimary = pathsEqual(node.path, selectedPath)
  const isSelected =
    isPrimary || selectedPaths.some((path) => pathsEqual(node.path, path))
  const selectionState = isPrimary
    ? "primary"
    : isSelected
      ? "secondary"
      : "none"
  return (
    <>
      <div
        ref={setNodeRef}
        className={cn(
          "relative flex w-full items-center gap-0.5",
          isDragging && "z-10 opacity-70"
        )}
        style={{
          paddingLeft: 8 + depth * 12,
          transform: transform
            ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
            : undefined,
        }}
      >
        <DropZone
          node={node}
          placement="before"
          active={activeDropTarget?.id === dropId(node.path, "before")}
          disabled={beforeAfterDropDisabled}
        />
        <DropZone
          node={node}
          placement="inside"
          active={activeDropTarget?.id === dropId(node.path, "inside")}
          disabled={insideDropDisabled}
        />
        <DropZone
          node={node}
          placement="after"
          active={activeDropTarget?.id === dropId(node.path, "after")}
          disabled={beforeAfterDropDisabled}
        />
        {hasChildren ? (
          <button
            type="button"
            disabled={disabled}
            aria-label={
              collapsed ? `${node.label} を展開` : `${node.label} を折りたたむ`
            }
            aria-expanded={!collapsed}
            data-testid={`outline-toggle-${key}`}
            className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            onClick={() => onToggleCollapse(node.path)}
          >
            {collapsed ? (
              <ChevronRight className="size-3.5" aria-hidden />
            ) : (
              <ChevronDown className="size-3.5" aria-hidden />
            )}
          </button>
        ) : (
          <span className="size-5 shrink-0" aria-hidden />
        )}
        <button
          type="button"
          disabled={disabled}
          data-dragging={isDragging ? "true" : "false"}
          {...(draggableDisabled ? {} : attributes)}
          {...(draggableDisabled ? {} : listeners)}
          onClick={(e) => {
            const mode =
              e.metaKey || e.ctrlKey ? "add" : e.shiftKey ? "range" : "replace"
            onSelect(node.path, mode)
          }}
          title={node.label}
          aria-pressed={isSelected}
          data-selection-state={selectionState}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-muted",
            !draggableDisabled && "cursor-grab active:cursor-grabbing",
            isPrimary && "bg-primary/15 font-semibold text-foreground",
            !isPrimary &&
              isSelected &&
              "bg-sky-500/10 font-medium text-foreground"
          )}
        >
          {node.isLocked && (
            <Lock className="size-3 shrink-0 text-amber-700" aria-hidden />
          )}
          <span className="shrink-0 text-muted-foreground">{node.tagName}</span>
          {visibleTextPreview && (
            <span className="min-w-0 flex-1 truncate">
              {visibleTextPreview}
            </span>
          )}
        </button>
      </div>
      {!collapsed &&
        node.children.map((child, i) => (
          <OutlineRow
            key={`${child.path.join("-")}-${i}`}
            node={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            selectedPaths={selectedPaths}
            disabled={disabled}
            collapsedPaths={collapsedPaths}
            activeDropTarget={activeDropTarget}
            activeDragPath={activeDragPath}
            dragDisabled={dragDisabled}
            onToggleCollapse={onToggleCollapse}
            onSelect={onSelect}
          />
        ))}
    </>
  )
}

export function OutlinePanel({
  nodes,
  selectedPath,
  selectedPaths,
  collapsedPaths,
  disabled = false,
  onToggleCollapse,
  onExpandAll,
  onCollapseAll,
  onMoveElement,
  onSelect,
}: OutlinePanelProps) {
  const [activeDragPath, setActiveDragPath] = useState<ElementPath | null>(null)
  const [activeDropTarget, setActiveDropTarget] = useState<DropTarget | null>(
    null
  )
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  )
  const controlsDisabled = disabled || nodes.length === 0
  const dragDisabled = disabled || selectedPaths.length > 1

  const resolveDropTarget = (
    activePath: ElementPath | null,
    over: DragOverEvent["over"] | DragEndEvent["over"]
  ): DropTarget | null => {
    const targetPath = over?.data.current?.path as ElementPath | undefined
    const placement = over?.data.current?.placement as DropPlacement | undefined
    if (!activePath || !over || !targetPath || !placement) return null
    if (!canDropOnTarget(activePath, targetPath, placement)) return null
    return { id: String(over.id), path: targetPath, placement }
  }

  const handleDragOver = (event: DragOverEvent) => {
    const activePath =
      (event.active.data.current?.path as ElementPath | undefined) ??
      activeDragPath
    const nextTarget = resolveDropTarget(activePath, event.over)
    setActiveDropTarget(nextTarget)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const activePath =
      (event.active.data.current?.path as ElementPath | undefined) ??
      activeDragPath
    const target = resolveDropTarget(activePath, event.over)
    setActiveDragPath(null)
    setActiveDropTarget(null)
    if (!activePath || !target) return
    onMoveElement(activePath, target.path, target.placement)
  }

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          アウトライン
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={controlsDisabled}
            title="すべて開く"
            aria-label="アウトラインをすべて開く"
            data-testid="outline-expand-all"
            className="flex size-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            onClick={onExpandAll}
          >
            <ChevronsDown className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            disabled={controlsDisabled}
            title="すべて閉じる"
            aria-label="アウトラインをすべて閉じる"
            data-testid="outline-collapse-all"
            className="flex size-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            onClick={onCollapseAll}
          >
            <ChevronsRight className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={(event) => {
            const path = event.active.data.current?.path as
              | ElementPath
              | undefined
            setActiveDragPath(path ?? null)
          }}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={() => {
            setActiveDragPath(null)
            setActiveDropTarget(null)
          }}
        >
          <div className="p-1.5">
            {disabled ? (
              <p className="px-2 py-4 text-xs text-muted-foreground">
                ソースモードでは利用できません。
              </p>
            ) : nodes.length === 0 ? (
              <p className="px-2 py-4 text-xs text-muted-foreground">
                HTML を読み込むと構造がここに表示されます。
              </p>
            ) : (
              nodes.map((node, i) => (
                <OutlineRow
                  key={`${node.path.join("-")}-${i}`}
                  node={node}
                  depth={0}
                  selectedPath={selectedPath}
                  selectedPaths={selectedPaths}
                  disabled={disabled}
                  collapsedPaths={collapsedPaths}
                  activeDropTarget={activeDropTarget}
                  activeDragPath={activeDragPath}
                  dragDisabled={dragDisabled}
                  onToggleCollapse={onToggleCollapse}
                  onSelect={onSelect}
                />
              ))
            )}
          </div>
        </DndContext>
      </ScrollArea>
      {disabled && (
        <div
          className="pointer-events-none absolute inset-0 bg-background/50"
          aria-hidden
        />
      )}
    </div>
  )
}
