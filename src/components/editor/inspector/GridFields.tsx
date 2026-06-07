import { Grid2X2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { CanvasHandle } from "@/components/editor/Canvas"
import type { GridColumnCount } from "@/editor/gridOps"

const GRID_COUNTS: GridColumnCount[] = [1, 2, 3, 4]

export function GridFields({
  canvas,
  count,
}: {
  canvas: CanvasHandle | null
  count: number | null
}) {
  const selected = count ?? 2
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold text-muted-foreground">
        グリッドの編集
      </h3>
      <div className="grid grid-cols-4 gap-1.5">
        {GRID_COUNTS.map((value) => (
          <Button
            key={value}
            variant={selected === value ? "default" : "outline"}
            size="sm"
            data-testid={`grid-cols-${value}`}
            onClick={() => canvas?.setGridColumnCount(value)}
          >
            <Grid2X2 /> {value}
          </Button>
        ))}
      </div>
    </section>
  )
}
