import { useState } from "react"
import { FileAudio, FileVideo } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Toggle } from "@/components/ui/toggle"
import type { CanvasHandle } from "@/components/editor/Canvas"
import type { SelectionInfo } from "@/editor/types"

function hasBoolAttr(attrs: Record<string, string>, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(attrs, name)
}

export function MediaFields({
  selection,
  canvas,
}: {
  selection: SelectionInfo
  canvas: CanvasHandle | null
}) {
  const isVideo = selection.isVideo
  const label = isVideo ? "動画" : "音声"
  const testPrefix = isVideo ? "video" : "audio"
  const styleWidth = /(?:^|;)\s*width\s*:\s*([^;]+)/i.exec(
    selection.attributes.style ?? ""
  )
  const [src, setSrc] = useState(selection.attributes.src ?? "")
  const [poster, setPoster] = useState(selection.attributes.poster ?? "")
  const [width, setWidth] = useState(styleWidth ? styleWidth[1].trim() : "")

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold text-muted-foreground">{label}</h3>
      <div className="space-y-1">
        <Label className="text-[11px]" htmlFor={`${testPrefix}-src`}>
          メディアのパス / URL
        </Label>
        <Input
          id={`${testPrefix}-src`}
          data-testid={`${testPrefix}-src`}
          value={src}
          placeholder="例: ./clip.mp4 または https://..."
          onChange={(e) => setSrc(e.target.value)}
          onBlur={() => canvas?.setAttributeOnSelected("src", src)}
          onKeyDown={(e) => {
            if (e.key === "Enter") canvas?.setAttributeOnSelected("src", src)
          }}
        />
      </div>
      {isVideo && (
        <div className="space-y-1">
          <Label className="text-[11px]" htmlFor="video-poster">
            ポスター画像 (poster)
          </Label>
          <Input
            id="video-poster"
            data-testid="video-poster"
            value={poster}
            placeholder="例: ./images/poster.png"
            onChange={(e) => setPoster(e.target.value)}
            onBlur={() => canvas?.setAttributeOnSelected("poster", poster)}
            onKeyDown={(e) => {
              if (e.key === "Enter")
                canvas?.setAttributeOnSelected("poster", poster)
            }}
          />
        </div>
      )}
      <div className="space-y-1">
        <Label className="text-[11px]" htmlFor={`${testPrefix}-width`}>
          表示幅 (例: 480px / 100%)
        </Label>
        <Input
          id={`${testPrefix}-width`}
          data-testid={`${testPrefix}-width`}
          value={width}
          onChange={(e) => setWidth(e.target.value)}
          onBlur={() => canvas?.setStyleOnSelected("width", width)}
          onKeyDown={(e) => {
            if (e.key === "Enter") canvas?.setStyleOnSelected("width", width)
          }}
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Toggle
          variant="outline"
          size="sm"
          pressed={hasBoolAttr(selection.attributes, "controls")}
          data-testid={`${testPrefix}-controls`}
          onPressedChange={(next) =>
            canvas?.setBooleanAttributeOnSelected("controls", next)
          }
        >
          コントロール
        </Toggle>
        <Toggle
          variant="outline"
          size="sm"
          pressed={hasBoolAttr(selection.attributes, "loop")}
          data-testid={`${testPrefix}-loop`}
          onPressedChange={(next) =>
            canvas?.setBooleanAttributeOnSelected("loop", next)
          }
        >
          ループ
        </Toggle>
        <Toggle
          variant="outline"
          size="sm"
          pressed={hasBoolAttr(selection.attributes, "muted")}
          data-testid={`${testPrefix}-muted`}
          onPressedChange={(next) =>
            canvas?.setBooleanAttributeOnSelected("muted", next)
          }
        >
          ミュート
        </Toggle>
        <Toggle
          variant="outline"
          size="sm"
          pressed={hasBoolAttr(selection.attributes, "autoplay")}
          data-testid={`${testPrefix}-autoplay`}
          onPressedChange={(next) =>
            canvas?.setBooleanAttributeOnSelected("autoplay", next)
          }
        >
          自動再生
        </Toggle>
      </div>
      <Button
        variant="outline"
        size="sm"
        data-testid={`${testPrefix}-pick-file`}
        onClick={() => canvas?.chooseMediaSource()}
      >
        {isVideo ? <FileVideo /> : <FileAudio />} ファイルから選択
      </Button>
      <p className="text-[11px] text-muted-foreground">
        HTML と同じフォルダ（またはサブフォルダ）にファイルを置き、相対パスで参照します。FSA
        対応ブラウザで HTML を開いている場合、ファイル選択時に自動計算されます。
      </p>
    </section>
  )
}
