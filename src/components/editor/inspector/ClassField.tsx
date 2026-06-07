import { useState } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { CanvasHandle } from "@/components/editor/Canvas"
import type { SelectionInfo } from "@/editor/types"

export function ClassField({
  selection,
  canvas,
}: {
  selection: SelectionInfo
  canvas: CanvasHandle | null
}) {
  const [value, setValue] = useState(selection.className ?? "")

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold text-muted-foreground">クラス</h3>
      <div className="space-y-1">
        <Label className="text-[11px]" htmlFor="class-input">
          class 属性
        </Label>
        <Input
          id="class-input"
          data-testid="class-input"
          value={value}
          placeholder="例: lead note he-card（スペース区切りで複数）"
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => canvas?.setAttributeOnSelected("class", value.trim())}
          onKeyDown={(e) => {
            if (e.key === "Enter")
              canvas?.setAttributeOnSelected("class", value.trim())
          }}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        スペース区切りで複数指定できます。空にすると class 属性を削除します。
      </p>
    </section>
  )
}
