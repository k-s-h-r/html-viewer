import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { StylePropState, StyleToken } from "@/editor/types"

import { labelForSource } from "./helpers"

const CSS_VAR_RE = /var\(\s*(--[^)]+)\s*\)/

function parseInlineCssVar(inlineValue: string): string | null {
  return CSS_VAR_RE.exec(inlineValue.trim())?.[1] ?? null
}

export function StyleMeta({ state }: { state: StylePropState }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
      <span
        className="rounded border px-1 py-0.5 leading-none"
        data-testid={`style-source-${state.prop}`}
      >
        {labelForSource(state.source)}
      </span>
      <span className="min-w-0 truncate" title={state.computedValue}>
        実効: {state.computedValue || "-"}
      </span>
    </div>
  )
}

export function ClearStyleButton({
  prop,
  state,
  onSetStyle,
}: {
  prop: string
  state: StylePropState
  onSetStyle: (prop: string, value: string) => void
}) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      title="個別指定を解除"
      disabled={!state.inlineValue}
      data-testid={`style-clear-${prop}`}
      onClick={() => onSetStyle(prop, "")}
    >
      <X />
    </Button>
  )
}

export function TokenSelect({
  tokens,
  testIdPrefix,
  inlineValue,
  onApply,
}: {
  tokens: StyleToken[]
  testIdPrefix: string
  inlineValue: string
  onApply: (token: StyleToken) => void
}) {
  if (tokens.length === 0) return null

  const inlineVar = parseInlineCssVar(inlineValue)
  const selectedToken = inlineVar
    ? tokens.find((token) => token.name === inlineVar)
    : undefined

  return (
    <Select
      modal={false}
      value={selectedToken?.name ?? null}
      onValueChange={(name) => {
        if (!name) return
        const token = tokens.find((candidate) => candidate.name === name)
        if (token) onApply(token)
      }}
    >
      <SelectTrigger
        className="w-full font-mono"
        size="sm"
        data-testid={`style-token-${testIdPrefix}-select`}
      >
        <SelectValue placeholder="CSS変数を選択" />
      </SelectTrigger>
      <SelectContent>
        {tokens.map((token) => (
          <SelectItem
            key={token.name}
            value={token.name}
            title={`${token.name}: ${token.value}`}
            data-testid={`style-token-${testIdPrefix}-${token.name}`}
          >
            {token.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
