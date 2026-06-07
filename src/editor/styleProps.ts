import type {
  StyleCatalog,
  StylePropState,
  StyleToken,
  StyleTokenKind,
} from "./types"

export const STYLE_PROP_NAMES = [
  "color",
  "background-color",
  "font-size",
  "font-weight",
  "line-height",
  "text-align",
  "padding",
  "margin",
  "border",
  "border-radius",
] as const

type StylePropName = (typeof STYLE_PROP_NAMES)[number]

export const emptyStyleCatalog = (): StyleCatalog => ({
  all: [],
  colors: [],
  sizes: [],
})

function cssSupports(
  win: Window | null | undefined,
  prop: string,
  value: string
): boolean {
  const css = (
    win as
      | (Window & { CSS?: { supports?: typeof CSS.supports } })
      | null
      | undefined
  )?.CSS
  return !!css?.supports?.(prop, value)
}

export function inferTokenKind(
  value: string,
  win?: Window | null
): StyleTokenKind {
  const trimmed = value.trim()
  if (!trimmed) return "unknown"
  if (
    /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|oklch\(|color\(|transparent\b|currentColor\b)/i.test(
      trimmed
    )
  ) {
    return "color"
  }
  if (
    /\b(none|solid|dashed|dotted|double|groove|ridge|inset|outset)\b/i.test(
      trimmed
    )
  ) {
    return "unknown"
  }
  if (
    /^-?(?:\d+|\d*\.\d+)(?:px|r?em|rem|%|vh|vw|vmin|vmax|ch|ex|lh|cap|ic|mm|cm|in|pt|pc)\b/i.test(
      trimmed
    ) ||
    /^calc\(/i.test(trimmed)
  ) {
    return "size"
  }
  if (/^url\(/i.test(trimmed)) return "unknown"
  if (cssSupports(win, "color", trimmed)) return "color"
  if (
    cssSupports(win, "font-size", trimmed) ||
    cssSupports(win, "width", trimmed) ||
    cssSupports(win, "padding", trimmed)
  ) {
    return "size"
  }
  return "unknown"
}

function walkCssRules(rules: CSSRuleList, visit: (rule: CSSRule) => void) {
  for (const rule of Array.from(rules)) {
    visit(rule)
    const nested = (rule as CSSGroupingRule).cssRules
    if (nested) walkCssRules(nested, visit)
  }
}

function asStyleRule(rule: CSSRule): CSSStyleRule | null {
  const maybe = rule as CSSStyleRule
  return maybe.style && typeof maybe.selectorText === "string" ? maybe : null
}

const CUSTOM_PROP_IN_CSS_TEXT = /(--[a-zA-Z0-9_-]+)\s*:/g

function collectCustomProperties(
  style: CSSStyleDeclaration,
  byName: Map<string, StyleToken>,
  win: Window | null
): void {
  for (let i = 0; i < style.length; i++) {
    const name = style.item(i)
    if (!name.startsWith("--") || byName.has(name)) continue
    const value = style.getPropertyValue(name).trim()
    if (!value) continue
    byName.set(name, {
      name: name as `--${string}`,
      value,
      kind: inferTokenKind(value, win),
    })
  }

  // style.length に載らないカスタムプロパティ向け（:root 等）
  for (const match of style.cssText.matchAll(CUSTOM_PROP_IN_CSS_TEXT)) {
    const name = match[1]
    if (byName.has(name)) continue
    const value = style.getPropertyValue(name).trim()
    if (!value) continue
    byName.set(name, {
      name: name as `--${string}`,
      value,
      kind: inferTokenKind(value, win),
    })
  }
}

export function harvestStyleCatalog(doc: Document): StyleCatalog {
  const win = doc.defaultView
  const byName = new Map<string, StyleToken>()

  for (const sheet of Array.from(doc.styleSheets)) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      continue
    }

    walkCssRules(rules, (rule) => {
      const styleRule = asStyleRule(rule)
      if (!styleRule) return
      collectCustomProperties(styleRule.style, byName, win)
    })
  }

  const all = Array.from(byName.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  )
  return {
    all,
    colors: all.filter((token) => token.kind === "color"),
    sizes: all.filter((token) => token.kind === "size"),
  }
}

function authoredPropertyNames(prop: StylePropName): string[] {
  if (prop === "border") {
    return ["border", "border-width", "border-style", "border-color"]
  }
  if (prop === "padding" || prop === "margin") {
    return [
      prop,
      `${prop}-top`,
      `${prop}-right`,
      `${prop}-bottom`,
      `${prop}-left`,
    ]
  }
  if (prop === "border-radius") {
    return [
      "border-radius",
      "border-top-left-radius",
      "border-top-right-radius",
      "border-bottom-right-radius",
      "border-bottom-left-radius",
    ]
  }
  return [prop]
}

function selectorMatches(el: Element, selectorText: string): boolean {
  for (const selector of selectorText.split(",")) {
    try {
      if (el.matches(selector.trim())) return true
    } catch {
      continue
    }
  }
  return false
}

function hasAuthorDeclaration(el: Element, prop: StylePropName): boolean {
  const doc = el.ownerDocument
  const win = doc.defaultView
  if (!win) return false
  const names = authoredPropertyNames(prop)

  for (const sheet of Array.from(doc.styleSheets)) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      continue
    }

    let found = false
    walkCssRules(rules, (rule) => {
      const styleRule = asStyleRule(rule)
      if (found || !styleRule) return
      if (!selectorMatches(el, styleRule.selectorText)) return
      found = names.some(
        (name) => styleRule.style.getPropertyValue(name) !== ""
      )
    })
    if (found) return true
  }

  return false
}

export function readStyleState(el: Element): Record<string, StylePropState> {
  const win = el.ownerDocument.defaultView
  const computed = win?.getComputedStyle(el) ?? null
  const inlineStyle = (el as HTMLElement).style
  const state: Record<string, StylePropState> = {}

  for (const prop of STYLE_PROP_NAMES) {
    const inlineValue = inlineStyle?.getPropertyValue(prop).trim() ?? ""
    const computedValue = computed?.getPropertyValue(prop).trim() ?? ""
    state[prop] = {
      prop,
      inlineValue,
      computedValue,
      source: inlineValue
        ? "inline"
        : hasAuthorDeclaration(el, prop)
          ? "author"
          : "unset",
    }
  }

  return state
}
