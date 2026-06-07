import { useState } from "react"
import { FileImage, Image as ImageIcon, Shapes } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { CanvasHandle } from "@/components/editor/Canvas"
import type { SelectionInfo } from "@/editor/types"

export function ImageFields({
  selection,
  canvas,
}: {
  selection: SelectionInfo
  canvas: CanvasHandle | null
}) {
  const [src, setSrc] = useState(selection.attributes.src ?? "")
  const [alt, setAlt] = useState(selection.attributes.alt ?? "")
  const [width, setWidth] = useState(selection.imageDisplayWidth ?? "")

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold text-muted-foreground">画像</h3>
      <div className="space-y-1">
        <Label className="text-[11px]" htmlFor="img-src">
          画像のパス / URL
        </Label>
        <Input
          id="img-src"
          data-testid="img-src"
          value={src}
          placeholder="例: ./figure.png または https://..."
          onChange={(e) => setSrc(e.target.value)}
          onBlur={() => canvas?.setAttributeOnSelected("src", src)}
          onKeyDown={(e) => {
            if (e.key === "Enter") canvas?.setAttributeOnSelected("src", src)
          }}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[11px]" htmlFor="img-alt">
          代替テキスト (alt)
        </Label>
        <Input
          id="img-alt"
          data-testid="img-alt"
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          onBlur={() => canvas?.setAttributeOnSelected("alt", alt)}
          onKeyDown={(e) => {
            if (e.key === "Enter") canvas?.setAttributeOnSelected("alt", alt)
          }}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[11px]" htmlFor="img-width">
          表示幅 (例: 320px / 50%)
        </Label>
        <Input
          id="img-width"
          data-testid="img-width"
          value={width}
          onChange={(e) => setWidth(e.target.value)}
          onBlur={() => canvas?.setSelectedImageDisplayWidth(width)}
          onKeyDown={(e) => {
            if (e.key === "Enter") canvas?.setSelectedImageDisplayWidth(width)
          }}
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button
          variant="outline"
          size="sm"
          data-testid="img-replace"
          onClick={() => canvas?.chooseMediaSource()}
        >
          <ImageIcon /> ファイル参照
        </Button>
        <Button
          variant="outline"
          size="sm"
          data-testid="img-replace-base64"
          onClick={() => canvas?.chooseImageAsDataUrl()}
        >
          <FileImage /> base64読込
        </Button>
        <Button
          variant="outline"
          size="sm"
          data-testid="img-annotation-open"
          onClick={() => canvas?.openImageAnnotationEditor()}
        >
          <Shapes /> 図形を編集
        </Button>
      </div>
    </section>
  )
}
