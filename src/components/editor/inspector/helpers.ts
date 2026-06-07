import type {
  StyleCatalog,
  StylePropState,
  StyleToken,
} from "@/editor/types"

export const HEX_COLOR_RE = /^#[0-9a-f]{3,8}$/i

export const TOKEN_PREFIX = {
  fontColor: "--he-font-color-",
  background: "--he-background-",
  fontSize: "--he-font-size-",
  lineHeight: "--he-line-height-",
  padding: "--he-padding-",
  margin: "--he-margin-",
  border: "--he-border-",
  borderRadius: "--he-border-radius-",
} as const

export function tokensWithPrefix(
  catalog: StyleCatalog,
  prefix: string
): StyleToken[] {
  return catalog.all
    .filter((token) => token.name.startsWith(prefix))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function borderTokens(catalog: StyleCatalog): StyleToken[] {
  return tokensWithPrefix(catalog, TOKEN_PREFIX.border).filter(
    (token) => !token.name.startsWith(TOKEN_PREFIX.borderRadius)
  )
}

export function labelForSource(source: StylePropState["source"]): string {
  if (source === "inline") return "個別"
  if (source === "author") return "テーマ"
  return "未設定"
}

export function toHexColor(value: string): string | null {
  const trimmed = value.trim()
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase()
  const shortHex = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(trimmed)
  if (shortHex) {
    return `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`.toLowerCase()
  }
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(trimmed)
  if (!rgb) return null
  return `#${[rgb[1], rgb[2], rgb[3]]
    .map((part) => Number(part).toString(16).padStart(2, "0"))
    .join("")}`
}

export function parseBorder(value: string) {
  const width = value.match(/\b\d+(?:\.\d+)?(?:px|em|rem|%)\b/i)?.[0] ?? ""
  const style =
    value.match(/\b(none|solid|dashed|dotted|double)\b/i)?.[0] ?? "solid"
  const color =
    toHexColor(value) ??
    value.match(/\b(?:rgb|hsl)a?\([^)]+\)|#[0-9a-f]{3,8}\b/i)?.[0] ??
    "#000000"
  return { width, style, color }
}

export function normalizeFontWeight(v: string): string {
  if (v === "bold") return "700"
  if (v === "normal") return "400"
  return v
}
