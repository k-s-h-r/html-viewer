import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold } from "lucide-react"

import type { CanvasHandle } from "@/components/editor/Canvas"
import type { SelectionInfo, StyleCatalog } from "@/editor/types"

import {
  TOKEN_PREFIX,
  borderTokens,
  normalizeFontWeight,
  tokensWithPrefix,
} from "./helpers"
import {
  BorderField,
  ChoiceStyleField,
  ColorField,
  SelectStyleField,
  TextInputStyleField,
} from "./style-fields"

export function StyleSection({
  selection,
  catalog,
  canvas,
  multiSelect = false,
}: {
  selection: SelectionInfo
  catalog: StyleCatalog
  canvas: CanvasHandle | null
  multiSelect?: boolean
}) {
  const state = selection.styleState
  const setStyle = (prop: string, value: string) => {
    if (multiSelect) canvas?.setStyleOnSelection(prop, value)
    else canvas?.setStyleOnSelected(prop, value)
  }

  return (
    <section className="space-y-3" data-testid="style-section">
      <h3 className="text-xs font-semibold text-muted-foreground">
        個別スタイル
      </h3>
      <ColorField
        label="文字色"
        prop="color"
        state={state.color}
        tokens={tokensWithPrefix(catalog, TOKEN_PREFIX.fontColor)}
        onSetStyle={setStyle}
      />
      <ColorField
        label="背景色"
        prop="background-color"
        state={state["background-color"]}
        tokens={tokensWithPrefix(catalog, TOKEN_PREFIX.background)}
        onSetStyle={setStyle}
      />
      <TextInputStyleField
        label="文字サイズ"
        prop="font-size"
        state={state["font-size"]}
        tokens={tokensWithPrefix(catalog, TOKEN_PREFIX.fontSize)}
        onSetStyle={setStyle}
        placeholder="16px / 1.2rem / var(--size)"
      />
      <SelectStyleField
        label="太さ"
        prop="font-weight"
        state={state["font-weight"]}
        onSetStyle={setStyle}
        normalizeValue={normalizeFontWeight}
        choices={[
          { value: "400", label: "標準" },
          { value: "700", label: "太字", icon: <Bold /> },
        ]}
      />
      <TextInputStyleField
        label="行間"
        prop="line-height"
        state={state["line-height"]}
        onSetStyle={setStyle}
        tokens={tokensWithPrefix(catalog, TOKEN_PREFIX.lineHeight)}
        placeholder="1.6 / 24px"
      />
      <ChoiceStyleField
        label="整列"
        prop="text-align"
        state={state["text-align"]}
        onSetStyle={setStyle}
        choices={[
          { value: "left", label: "左", icon: <AlignLeft /> },
          { value: "center", label: "中央", icon: <AlignCenter /> },
          { value: "right", label: "右", icon: <AlignRight /> },
          { value: "justify", label: "均等", icon: <AlignJustify /> },
        ]}
      />
      <TextInputStyleField
        label="padding"
        prop="padding"
        state={state.padding}
        onSetStyle={setStyle}
        tokens={tokensWithPrefix(catalog, TOKEN_PREFIX.padding)}
        placeholder="8px 12px"
      />
      <TextInputStyleField
        label="margin"
        prop="margin"
        state={state.margin}
        onSetStyle={setStyle}
        tokens={tokensWithPrefix(catalog, TOKEN_PREFIX.margin)}
        placeholder="0 0 16px"
      />
      <BorderField
        state={state.border}
        tokens={borderTokens(catalog)}
        onSetStyle={setStyle}
      />
      <TextInputStyleField
        label="角丸"
        prop="border-radius"
        state={state["border-radius"]}
        onSetStyle={setStyle}
        tokens={tokensWithPrefix(catalog, TOKEN_PREFIX.borderRadius)}
        placeholder="8px"
      />
    </section>
  )
}
