export type CustomHtmlValidationResult =
  | { ok: true; element: Element }
  | { ok: false; message: string }

const DISALLOWED_ROOT_TAGS = new Set([
  "body",
  "head",
  "html",
  "link",
  "meta",
  "script",
  "title",
])

function parseTemplate(doc: Document, html: string): HTMLTemplateElement {
  const template = doc.createElement("template")
  template.innerHTML = html.trim()
  return template
}

function hasNonWhitespaceText(node: Node): boolean {
  return node.nodeType === Node.TEXT_NODE && !!node.textContent?.trim()
}

export function validateCustomHtmlElement(
  doc: Document,
  html: string
): CustomHtmlValidationResult {
  const trimmed = html.trim()
  if (!trimmed) {
    return { ok: false, message: "挿入する HTML を入力してください。" }
  }

  const documentRootMatch = trimmed.match(/^<(html|head|body)(\s|>)/i)
  if (documentRootMatch) {
    const tag = documentRootMatch[1].toLowerCase()
    return {
      ok: false,
      message: `<${tag}> は挿入できません。body 内に置く要素を入力してください。`,
    }
  }

  const template = parseTemplate(doc, trimmed)
  const roots = Array.from(template.content.children)
  const invalidSiblings = Array.from(template.content.childNodes).some(
    (node) => node.nodeType !== Node.ELEMENT_NODE && hasNonWhitespaceText(node)
  )

  if (roots.length !== 1 || invalidSiblings) {
    return {
      ok: false,
      message: "単一のルート要素を持つ HTML 断片を入力してください。",
    }
  }

  const root = roots[0]
  const tag = root.tagName.toLowerCase()
  if (DISALLOWED_ROOT_TAGS.has(tag)) {
    return {
      ok: false,
      message: `<${tag}> は挿入できません。body 内に置く要素を入力してください。`,
    }
  }

  if (tag === "script" || root.querySelector("script")) {
    return { ok: false, message: "script 要素は挿入できません。" }
  }

  return { ok: true, element: root }
}

export function createCustomHtmlElement(
  doc: Document,
  html: string
): Element | null {
  const result = validateCustomHtmlElement(doc, html)
  if (!result.ok) return null
  return result.element
}
