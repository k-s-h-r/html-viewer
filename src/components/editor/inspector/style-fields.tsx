import { useRef } from "react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { StylePropState, StyleToken } from "@/editor/types"

import { HEX_COLOR_RE, parseBorder, toHexColor } from "./helpers"
import { ClearStyleButton, StyleMeta, TokenSelect } from "./shared"

function styleStateKey(state: StylePropState): string {
  return `${state.inlineValue}\u0000${state.computedValue}`
}

type SetStyleFn = (prop: string, value: string) => void

export function ColorField({
  label,
  prop,
  state,
  tokens,
  onSetStyle,
}: {
  label: string
  prop: "color" | "background-color"
  state: StylePropState
  tokens: StyleToken[]
  onSetStyle: SetStyleFn
}) {
  const initialColor =
    toHexColor(state.inlineValue || state.computedValue) ?? "#000000"
  const inputKey = styleStateKey(state)

  const apply = (next: string) => {
    onSetStyle(prop, next)
  }

  const commitText = (next: string) => {
    const trimmed = next.trim()
    if (
      trimmed === "" ||
      HEX_COLOR_RE.test(trimmed) ||
      trimmed.startsWith("var(")
    ) {
      onSetStyle(prop, trimmed)
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Label className="text-[11px]">{label}</Label>
          <StyleMeta state={state} />
        </div>
        <ClearStyleButton prop={prop} state={state} onSetStyle={onSetStyle} />
      </div>
      <div className="grid grid-cols-[2.25rem_1fr] gap-1.5">
        <Input
          type="color"
          aria-label={label}
          data-testid={`style-${prop}-picker`}
          value={initialColor}
          onChange={(e) => apply(e.target.value)}
          className="px-1"
        />
        <Input
          key={inputKey}
          defaultValue={state.inlineValue || initialColor}
          data-testid={`style-${prop}`}
          placeholder="#000000 / var(--token)"
          onBlur={(e) => commitText(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitText(e.currentTarget.value)
            }
          }}
        />
      </div>
      <div className="flex gap-1">
        <Button
          type="button"
          variant="outline"
          size="xs"
          data-testid={`style-${prop}-transparent`}
          onClick={() => onSetStyle(prop, "transparent")}
        >
          透明
        </Button>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() => onSetStyle(prop, "")}
        >
          クリア
        </Button>
      </div>
      <TokenSelect
        tokens={tokens}
        testIdPrefix={prop}
        inlineValue={state.inlineValue}
        onApply={(token) => onSetStyle(prop, `var(${token.name})`)}
      />
    </div>
  )
}

export function TextInputStyleField({
  label,
  prop,
  state,
  onSetStyle,
  tokens = [],
  placeholder,
}: {
  label: string
  prop: string
  state: StylePropState
  onSetStyle: SetStyleFn
  tokens?: StyleToken[]
  placeholder?: string
}) {
  const commit = (value: string) => onSetStyle(prop, value.trim())

  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Label className="text-[11px]">{label}</Label>
          <StyleMeta state={state} />
        </div>
        <ClearStyleButton prop={prop} state={state} onSetStyle={onSetStyle} />
      </div>
      <Input
        key={styleStateKey(state)}
        defaultValue={state.inlineValue}
        placeholder={placeholder ?? state.computedValue}
        data-testid={`style-${prop}`}
        onBlur={(e) => commit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(e.currentTarget.value)
        }}
      />
      <TokenSelect
        tokens={tokens}
        testIdPrefix={prop}
        inlineValue={state.inlineValue}
        onApply={(token) => onSetStyle(prop, `var(${token.name})`)}
      />
    </div>
  )
}

export function SelectStyleField({
  label,
  prop,
  state,
  choices,
  onSetStyle,
  normalizeValue = (v: string) => v,
}: {
  label: string
  prop: string
  state: StylePropState
  choices: { value: string; label: string; icon?: ReactNode }[]
  onSetStyle: SetStyleFn
  normalizeValue?: (value: string) => string
}) {
  const resolveValue = (): string | null => {
    const inline = normalizeValue(state.inlineValue)
    if (inline) return inline
    const computed = normalizeValue(state.computedValue)
    if (choices.some((c) => normalizeValue(c.value) === computed)) return computed
    return null
  }
  const selected = resolveValue()

  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Label className="text-[11px]">{label}</Label>
          <StyleMeta state={state} />
        </div>
        <ClearStyleButton prop={prop} state={state} onSetStyle={onSetStyle} />
      </div>
      <Select
        modal={false}
        value={selected}
        onValueChange={(value) => {
          if (value != null) onSetStyle(prop, value)
        }}
      >
        <SelectTrigger
          className="w-full"
          size="sm"
          data-testid={`style-${prop}-select`}
        >
          <SelectValue placeholder="選択..." />
        </SelectTrigger>
        <SelectContent>
          {choices.map((choice) => (
            <SelectItem
              key={choice.value}
              value={choice.value}
              data-testid={`style-${prop}-${choice.value}`}
            >
              {choice.icon}
              {choice.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function ChoiceStyleField({
  label,
  prop,
  state,
  choices,
  onSetStyle,
  normalizeValue = (v: string) => v,
}: {
  label: string
  prop: string
  state: StylePropState
  choices: { value: string; label: string; icon?: ReactNode }[]
  onSetStyle: SetStyleFn
  normalizeValue?: (value: string) => string
}) {
  const activeValue = normalizeValue(state.inlineValue)
  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Label className="text-[11px]">{label}</Label>
          <StyleMeta state={state} />
        </div>
        <ClearStyleButton prop={prop} state={state} onSetStyle={onSetStyle} />
      </div>
      <div className="flex flex-wrap gap-1">
        {choices.map((choice) => (
          <Button
            key={choice.value}
            type="button"
            variant={
              activeValue === normalizeValue(choice.value)
                ? "secondary"
                : "outline"
            }
            size="sm"
            data-testid={`style-${prop}-${choice.value}`}
            onClick={() => onSetStyle(prop, choice.value)}
          >
            {choice.icon}
            {choice.label}
          </Button>
        ))}
      </div>
    </div>
  )
}

export function BorderField({
  state,
  tokens,
  onSetStyle,
}: {
  state: StylePropState
  tokens: StyleToken[]
  onSetStyle: SetStyleFn
}) {
  const parsed = parseBorder(state.inlineValue || state.computedValue)
  const widthRef = useRef<HTMLInputElement>(null)
  const styleRef = useRef<HTMLSelectElement>(null)
  const colorRef = useRef<HTMLInputElement>(null)
  const inputKey = styleStateKey(state)

  const currentBorder = (
    next: Partial<{ width: string; style: string; color: string }> = {}
  ) => ({
    width: next.width ?? widthRef.current?.value ?? parsed.width,
    style: next.style ?? styleRef.current?.value ?? parsed.style,
    color: next.color ?? colorRef.current?.value ?? parsed.color,
  })

  const commit = (next = currentBorder()) => {
    if (next.style === "none") {
      onSetStyle("border", "none")
      return
    }
    onSetStyle(
      "border",
      `${next.width || "1px"} ${next.style} ${next.color}`
    )
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Label className="text-[11px]">枠線</Label>
          <StyleMeta state={state} />
        </div>
        <ClearStyleButton prop="border" state={state} onSetStyle={onSetStyle} />
      </div>
      <div className="grid grid-cols-[1fr_5.5rem_2.25rem] gap-1.5">
        <Input
          key={`${inputKey}:width`}
          ref={widthRef}
          defaultValue={parsed.width}
          placeholder="1px"
          data-testid="style-border-width"
          onBlur={(e) => commit(currentBorder({ width: e.currentTarget.value }))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit(currentBorder({ width: e.currentTarget.value }))
            }
          }}
        />
        <select
          key={`${inputKey}:style`}
          ref={styleRef}
          defaultValue={parsed.style}
          data-testid="style-border-style"
          className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
          onChange={(e) => {
            const next = e.target.value
            commit(currentBorder({ style: next }))
          }}
        >
          <option value="solid">solid</option>
          <option value="dashed">dashed</option>
          <option value="dotted">dotted</option>
          <option value="double">double</option>
          <option value="none">none</option>
        </select>
        <Input
          key={`${inputKey}:color`}
          ref={colorRef}
          type="color"
          defaultValue={toHexColor(parsed.color) ?? "#000000"}
          data-testid="style-border-color"
          className="px-1"
          onChange={(e) => {
            const next = e.target.value
            commit(currentBorder({ color: next }))
          }}
        />
      </div>
      <TokenSelect
        tokens={tokens}
        testIdPrefix="border"
        inlineValue={state.inlineValue}
        onApply={(token) => onSetStyle("border", `var(${token.name})`)}
      />
    </div>
  )
}
