import { EDITOR_INJECTED_ATTR, EDITOR_TEMP_ATTRS } from "./dom"
import { restoreMediaSrcForSave } from "./mediaPreview"

function removeTempAttrs(el: Element) {
  for (const attr of EDITOR_TEMP_ATTRS) el.removeAttribute(attr)
  for (const name of el.getAttributeNames()) {
    if (name.startsWith("data-spec-")) el.removeAttribute(name)
  }
}

/** 要素ツリーから編集ツール由来の要素・属性を除去する */
export function cleanElementTree(root: Element): void {
  restoreMediaSrcForSave(root)
  root
    .querySelectorAll(`[${EDITOR_INJECTED_ATTR}]`)
    .forEach((el) => el.remove())
  removeTempAttrs(root)
  root.querySelectorAll("*").forEach(removeTempAttrs)
}

/** 単一要素をクリーンな outerHTML としてシリアライズする(コピー用) */
export function serializeCleanElement(el: Element): string {
  const clone = el.cloneNode(true) as Element
  cleanElementTree(clone)
  return clone.outerHTML
}

/**
 * iframe 内のドキュメントを複製し、編集ツール由来の要素・属性を除去した
 * クリーンな HTML 文字列を生成する。
 */
export function serializeCleanDocument(doc: Document): string {
  const clone = doc.documentElement.cloneNode(true) as HTMLElement
  cleanElementTree(clone)

  const doctype = doc.doctype
  const doctypeStr = doctype
    ? `<!DOCTYPE ${doctype.name}${doctype.publicId ? ` PUBLIC "${doctype.publicId}"` : ""}${
        doctype.systemId ? ` "${doctype.systemId}"` : ""
      }>\n`
    : "<!DOCTYPE html>\n"

  return doctypeStr + clone.outerHTML + "\n"
}

/** 空の初期ドキュメント(新規作成用) */
export function emptyDocumentHtml(title = "新しい仕様書"): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
<style>
  :root {
    --he-font-color-primary: #1f2937;
    --he-font-color-muted: #6b7280;
    --he-background-page: #ffffff;
    --he-font-size-body: 16px;
    --he-font-size-title: 32px;
    --he-line-height-body: 1.7;
    --he-padding-page: 0 24px;
    --he-margin-paragraph: 0 0 1em;
    --he-border-default: 1px solid #d1d5db;
    --he-border-radius-card: 8px;
  }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    font-size: var(--he-font-size-body);
    line-height: var(--he-line-height-body);
    max-width: 880px;
    margin: 40px auto;
    padding: var(--he-padding-page);
    color: var(--he-font-color-primary);
    background: var(--he-background-page);
  }
  h1, h2, h3 { line-height: 1.3; }
  h1 { font-size: var(--he-font-size-title); }
  p { margin: var(--he-margin-paragraph); }
  table { border-collapse: collapse; }
  th, td {
    border: var(--he-border-default);
    padding: 8px 12px;
  }
</style>
</head>
<body>
<h1>${title}</h1>
<p>ここに仕様の概要を記載します。左上の「開く」で既存の HTML を読み込むこともできます。</p>
</body>
</html>
`
}
