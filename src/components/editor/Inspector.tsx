import { useEffect, useRef, useState } from "react"

import {
  ArrowDown,
  ArrowUp,
  Bold,
  Copy,
  Italic,
  Link as LinkIcon,
  Lock,
  Pencil,
  Trash2,
  Underline,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Toggle } from "@/components/ui/toggle"
import { blockTemplatesByGroup } from "@/editor/blocks"
import type { CanvasHandle } from "@/components/editor/Canvas"
import type { SelectionInfo, StyleCatalog } from "@/editor/types"
import { cn } from "@/lib/utils"

import { ClassField } from "./inspector/ClassField"
import { ColumnFields } from "./inspector/ColumnFields"
import { GridFields } from "./inspector/GridFields"
import { ImageFields } from "./inspector/ImageFields"
import { MediaFields } from "./inspector/MediaFields"
import { StyleSection } from "./inspector/StyleSection"
import { TableFields } from "./inspector/TableFields"
import { CustomHtmlDialog } from "./CustomHtmlDialog"
import { SelectedHtmlDialog } from "./SelectedHtmlDialog"

const inspectorTabTriggerClass = cn(
  "h-full rounded-none border-0 border-b border-muted bg-muted/30 px-3 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase shadow-none after:hidden hover:bg-muted/50 hover:text-foreground",
  "data-active:border-b-transparent! data-active:bg-background! data-active:text-foreground data-active:shadow-none! data-active:hover:bg-background"
)

interface InspectorProps {
  selection: SelectionInfo | null
  selectionCount: number
  selectionStructureEditable: boolean
  canvas: CanvasHandle | null
  catalog: StyleCatalog
  disabled?: boolean
}

export function Inspector({
  selection,
  selectionCount,
  selectionStructureEditable,
  canvas,
  catalog,
  disabled = false,
}: InspectorProps) {
  const [inspectorTab, setInspectorTab] = useState<"edit" | "style">("edit")
  const editPanelRef = useRef<HTMLDivElement>(null)
  const stylePanelRef = useRef<HTMLDivElement>(null)
  const multiSelect = selectionCount > 1
  const selectionLocked = !!selection?.isLocked
  const singleSelectOnly = disabled || !selection || multiSelect
  const editSelectedDisabled = singleSelectOnly || selectionLocked
  const structureEditDisabled =
    disabled || !selection || !selectionStructureEditable
  const singleSelection = selection && !multiSelect

  useEffect(() => {
    const panel =
      inspectorTab === "edit" ? editPanelRef.current : stylePanelRef.current
    panel?.scrollTo({ top: 0 })
  }, [inspectorTab])

  return (
    <div className="relative flex h-full flex-col">
      <Tabs
        value={inspectorTab}
        onValueChange={(next) => {
          if (next === "edit" || next === "style") setInspectorTab(next)
        }}
        className="min-h-0 flex-1 gap-0"
      >
        <TabsList className="grid h-9 w-full grid-cols-2 gap-0 rounded-none border-x border-foreground/20 bg-background p-0">
          <TabsTrigger
            value="edit"
            data-testid="inspector-tab-edit"
            className={cn(inspectorTabTriggerClass, "border-r border-r-muted")}
          >
            編集
          </TabsTrigger>
          <TabsTrigger
            value="style"
            data-testid="inspector-tab-style"
            className={inspectorTabTriggerClass}
          >
            個別スタイル
          </TabsTrigger>
        </TabsList>

        <TabsContent value="edit" className="min-h-0 overflow-hidden">
          <div ref={editPanelRef} className="h-full overflow-y-auto">
            <div className="space-y-4 p-3">
              {disabled && (
                <p className="text-xs text-muted-foreground">
                  ソースモードでは利用できません。
                </p>
              )}

              <section className="space-y-3">
                <h3 className="text-xs font-semibold text-muted-foreground">
                  ブロックを追加
                </h3>
                {blockTemplatesByGroup().map(({ group, templates }) => (
                  <div key={group.id} className="space-y-1.5">
                    <h4 className="text-[11px] font-medium text-muted-foreground">
                      {group.label}
                    </h4>
                    <div className="grid grid-cols-2 gap-1.5">
                      {templates.map((tpl) => (
                        <Button
                          key={tpl.id}
                          variant="outline"
                          size="sm"
                          className="justify-start"
                          data-testid={`block-${tpl.id}`}
                          onClick={() => canvas?.insertBlock(tpl.html)}
                        >
                          {tpl.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
                <CustomHtmlDialog
                  disabled={disabled}
                  onInsert={(html) => canvas?.insertBlock(html)}
                />
                <p className="text-[11px] text-muted-foreground">
                  選択中の要素の直後に挿入されます（未選択時は末尾）。
                </p>
              </section>

              <Separator />

              <section className="space-y-3">
                <h3 className="text-xs font-semibold text-muted-foreground">
                  選択中の要素
                </h3>
                {selection ? (
                  multiSelect ? (
                    <div
                      className="rounded-md border bg-muted/40 p-2 text-xs"
                      data-testid="multi-selection-info"
                    >
                      <div className="font-medium">
                        {selectionCount} 個の要素を選択中
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        スタイルは選択中のすべての要素に適用されます。
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md border bg-muted/40 p-2 text-xs">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1 truncate font-mono font-medium">
                          &lt;{selection.tagName}&gt;
                          {selection.id ? `  #${selection.id}` : ""}
                        </div>
                        {selection.isLocked && (
                          <span className="inline-flex items-center gap-1 rounded-sm border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                            <Lock className="size-3" />
                            ロック中
                          </span>
                        )}
                      </div>
                      {selection.textPreview && (
                        <div className="mt-1 truncate text-muted-foreground">
                          {selection.textPreview}
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  <p className="text-xs text-muted-foreground">
                    キャンバス上で要素をクリックして選択してください。
                  </p>
                )}

                {selection && (
                  <div className="space-y-3 border-t pt-3">
                    {singleSelection && (
                      <>
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-muted-foreground">
                            ロック
                          </h4>
                          <Toggle
                            variant="outline"
                            size="sm"
                            pressed={selection.isSelfLocked}
                            disabled={
                              disabled ||
                              (selection.isLockedByAncestor &&
                                !selection.isSelfLocked)
                            }
                            data-testid="element-lock-toggle"
                            onPressedChange={(next) =>
                              canvas?.setLockedOnSelected(next)
                            }
                          >
                            <Lock />
                            {selection.isSelfLocked
                              ? "ロックを解除"
                              : "この要素をロック"}
                          </Toggle>
                          {selection.isLockedByAncestor && (
                            <p className="text-[11px] text-muted-foreground">
                              親要素でロックされています。
                            </p>
                          )}
                        </div>
                        {!selectionLocked && selection.isImage && (
                          <ImageFields
                            key={`${selection.path.join(".")}:image:${selection.attributes.src ?? ""}:${selection.attributes.alt ?? ""}:${selection.attributes.style ?? ""}`}
                            selection={selection}
                            canvas={canvas}
                          />
                        )}
                        {!selectionLocked &&
                          (selection.isVideo || selection.isAudio) && (
                            <MediaFields
                              key={`${selection.path.join(".")}:media:${selection.tagName}:${selection.attributes.src ?? ""}:${selection.attributes.style ?? ""}`}
                              selection={selection}
                              canvas={canvas}
                            />
                          )}
                        {!selectionLocked && selection.isInTable && (
                          <TableFields canvas={canvas} />
                        )}
                        {!selectionLocked && selection.isInColumns && (
                          <ColumnFields canvas={canvas} />
                        )}
                        {!selectionLocked && selection.isInGrid && (
                          <GridFields
                            canvas={canvas}
                            count={selection.gridColumnCount}
                          />
                        )}
                        {!selectionLocked && selection.detailsOpen !== null && (
                          <div className="space-y-2">
                            <h4 className="text-xs font-semibold text-muted-foreground">
                              詳細（開閉）
                            </h4>
                            <Toggle
                              variant="outline"
                              size="sm"
                              pressed={selection.detailsOpen ?? false}
                              disabled={selectionLocked}
                              data-testid="details-open-toggle"
                              onPressedChange={(next) =>
                                canvas?.setDetailsOpen(next)
                              }
                            >
                              開いた状態で表示
                            </Toggle>
                            <p className="text-[11px] text-muted-foreground">
                              このスイッチは保存される HTML の初期表示状態（open
                              属性）になります。
                            </p>
                          </div>
                        )}
                      </>
                    )}
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-muted-foreground">
                        テキスト編集
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={
                            !selection.isTextEditable ||
                            multiSelect ||
                            selectionLocked
                          }
                          data-testid="fmt-edit-text"
                          onClick={() => canvas?.startTextEdit()}
                        >
                          <Pencil /> 文字を編集
                        </Button>
                        <SelectedHtmlDialog
                          disabled={structureEditDisabled || multiSelect}
                          getHtml={() => canvas?.getSelectedHtml() ?? null}
                          onApply={(html) =>
                            canvas?.replaceSelectedHtml(html) ?? false
                          }
                        />
                        <Button
                          variant="outline"
                          size="icon-sm"
                          disabled={editSelectedDisabled}
                          title="太字"
                          data-testid="fmt-bold"
                          onClick={() => canvas?.applyFormat("bold")}
                        >
                          <Bold />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          disabled={editSelectedDisabled}
                          title="斜体"
                          data-testid="fmt-italic"
                          onClick={() => canvas?.applyFormat("italic")}
                        >
                          <Italic />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          disabled={editSelectedDisabled}
                          title="下線"
                          data-testid="fmt-underline"
                          onClick={() => canvas?.applyFormat("underline")}
                        >
                          <Underline />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          disabled={editSelectedDisabled}
                          title="リンク"
                          data-testid="fmt-link"
                          onClick={() => canvas?.applyFormat("link")}
                        >
                          <LinkIcon />
                        </Button>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        要素をダブルクリックしても直接編集できます。
                      </p>
                    </div>
                  </div>
                )}
              </section>

              <Separator />

              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground">
                  要素の操作
                </h3>
                <div className="grid grid-cols-2 gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={structureEditDisabled}
                    data-testid="op-move-up"
                    onClick={() => canvas?.moveSelected("up")}
                  >
                    <ArrowUp /> 上へ
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={structureEditDisabled}
                    data-testid="op-move-down"
                    onClick={() => canvas?.moveSelected("down")}
                  >
                    <ArrowDown /> 下へ
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={structureEditDisabled}
                    data-testid="op-duplicate"
                    onClick={() => canvas?.duplicateSelected()}
                  >
                    <Copy /> 複製
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={structureEditDisabled}
                    data-testid="op-delete"
                    onClick={() => canvas?.deleteSelected()}
                  >
                    <Trash2 /> 削除
                  </Button>
                </div>
              </section>

              {singleSelection && !selectionLocked && (
                <ClassField
                  key={`${selection.path.join(".")}:class`}
                  selection={selection}
                  canvas={canvas}
                />
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="style" className="min-h-0 overflow-hidden">
          <div ref={stylePanelRef} className="h-full overflow-y-auto">
            <div className="p-3">
              {selection && !selectionLocked ? (
                <StyleSection
                  key={`${selection.path.join(".")}:style:${selectionCount}`}
                  selection={selection}
                  catalog={catalog}
                  canvas={canvas}
                  multiSelect={multiSelect}
                />
              ) : (
                <p className="text-xs text-muted-foreground">
                  個別スタイルを編集する要素を選択してください。
                </p>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
      {disabled && (
        <div
          className="pointer-events-none absolute inset-0 bg-background/50"
          aria-hidden
        />
      )}
    </div>
  )
}
