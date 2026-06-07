import { Columns3, Rows3, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { CanvasHandle } from "@/components/editor/Canvas"

export function TableFields({ canvas }: { canvas: CanvasHandle | null }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold text-muted-foreground">表の編集</h3>
      <div className="grid grid-cols-2 gap-1.5">
        <Button
          variant="outline"
          size="sm"
          data-testid="tbl-row-above"
          onClick={() => canvas?.tableOp("add-row-above")}
        >
          <Rows3 /> 行を上に
        </Button>
        <Button
          variant="outline"
          size="sm"
          data-testid="tbl-row-below"
          onClick={() => canvas?.tableOp("add-row-below")}
        >
          <Rows3 /> 行を下に
        </Button>
        <Button
          variant="outline"
          size="sm"
          data-testid="tbl-col-left"
          onClick={() => canvas?.tableOp("add-col-left")}
        >
          <Columns3 /> 列を左に
        </Button>
        <Button
          variant="outline"
          size="sm"
          data-testid="tbl-col-right"
          onClick={() => canvas?.tableOp("add-col-right")}
        >
          <Columns3 /> 列を右に
        </Button>
        <Button
          variant="outline"
          size="sm"
          data-testid="tbl-row-del"
          onClick={() => canvas?.tableOp("delete-row")}
        >
          <Trash2 /> 行を削除
        </Button>
        <Button
          variant="outline"
          size="sm"
          data-testid="tbl-col-del"
          onClick={() => canvas?.tableOp("delete-col")}
        >
          <Trash2 /> 列を削除
        </Button>
      </div>
      <Button
        variant="outline"
        size="sm"
        data-testid="tbl-header"
        onClick={() => canvas?.tableOp("toggle-header")}
      >
        ヘッダー行を切替
      </Button>
    </section>
  )
}
