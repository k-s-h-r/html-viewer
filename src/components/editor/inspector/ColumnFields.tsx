import { Columns3, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { CanvasHandle } from "@/components/editor/Canvas"

export function ColumnFields({ canvas }: { canvas: CanvasHandle | null }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold text-muted-foreground">
        カラムの編集
      </h3>
      <div className="grid grid-cols-2 gap-1.5">
        <Button
          variant="outline"
          size="sm"
          data-testid="col-add-left"
          onClick={() => canvas?.columnOp("add-col-left")}
        >
          <Columns3 /> 左に追加
        </Button>
        <Button
          variant="outline"
          size="sm"
          data-testid="col-add-right"
          onClick={() => canvas?.columnOp("add-col-right")}
        >
          <Columns3 /> 右に追加
        </Button>
        <Button
          variant="outline"
          size="sm"
          data-testid="col-delete"
          onClick={() => canvas?.columnOp("delete-col")}
        >
          <Trash2 /> カラム削除
        </Button>
      </div>
    </section>
  )
}
