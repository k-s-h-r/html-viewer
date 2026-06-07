export const LAYOUT_STYLE_ID = "html-editor-layout-styles"
export const LAYOUT_CLASS_PREFIX = "he-"

export const LAYOUT_CSS = `
.he-cols{display:grid;gap:16px;grid-template-columns:repeat(var(--he-col-count,2),minmax(0,1fr));align-items:start;margin:16px 0}
.he-col{min-width:0;box-sizing:border-box}
.he-grid{display:grid;gap:16px;grid-template-columns:repeat(var(--he-grid-col-count,2),minmax(0,1fr));align-items:stretch;margin:16px 0}
.he-card{min-width:0;border:1px solid #e5e7eb;border-radius:12px;padding:16px;background:#fff;box-shadow:0 1px 2px rgba(15,23,42,0.06);box-sizing:border-box}
.he-col>:first-child,.he-card>:first-child,.he-callout>:first-child{margin-top:0}
.he-col>:last-child,.he-card>:last-child,.he-callout>:last-child{margin-bottom:0}
.he-callout{margin:16px 0;padding:12px 16px;border-radius:8px;border-left:4px solid #94a3b8;background:#f8fafc;box-sizing:border-box}
.he-callout-info{border-left-color:#3b82f6;background:#eff6ff;color:#1e3a8a}
.he-callout-warning{border-left-color:#f59e0b;background:#fffbeb;color:#92400e}
.he-callout-success{border-left-color:#22c55e;background:#f0fdf4;color:#166534}
.he-image-annotation{position:relative;display:inline-block;max-width:100%;line-height:0;vertical-align:top}
.he-image-annotation>img{display:block;max-width:100%;height:auto}
.he-image-annotation-svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
@media(max-width:640px){.he-cols,.he-grid{grid-template-columns:1fr}}
`.trim()

export function ensureLayoutStyles(doc: Document): void {
  if (doc.getElementById(LAYOUT_STYLE_ID)) return
  const style = doc.createElement("style")
  style.id = LAYOUT_STYLE_ID
  style.textContent = LAYOUT_CSS
  doc.head.appendChild(style)
}

export function elementUsesLayoutStyles(el: Element): boolean {
  const className = el.getAttribute("class") ?? ""
  return (
    className.includes(LAYOUT_CLASS_PREFIX) ||
    !!el.querySelector(`[class*="${LAYOUT_CLASS_PREFIX}"]`)
  )
}
