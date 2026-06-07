export type ColumnOp = "add-col-left" | "add-col-right" | "delete-col"

interface ColumnContext {
  layout: HTMLElement
  column: HTMLElement
  columns: HTMLElement[]
  columnIndex: number
}

function directColumns(layout: HTMLElement): HTMLElement[] {
  return Array.from(layout.children).filter((child): child is HTMLElement =>
    child.classList.contains("he-col")
  )
}

export function getColumnContext(el: Element): ColumnContext | null {
  const layout = el.closest(".he-cols") as HTMLElement | null
  if (!layout) return null

  const columns = directColumns(layout)
  if (columns.length === 0) return null

  const closestColumn = el.closest(".he-col") as HTMLElement | null
  const column =
    closestColumn?.parentElement === layout ? closestColumn : columns[0]
  const columnIndex = columns.indexOf(column)
  if (columnIndex < 0) return null

  return { layout, column, columns, columnIndex }
}

function makeColumn(doc: Document): HTMLElement {
  const column = doc.createElement("div")
  column.className = "he-col"
  column.innerHTML = "<h4>新しいカラム</h4><p>内容を入力してください。</p>"
  return column
}

function syncColumnCount(layout: HTMLElement): void {
  const count = directColumns(layout).length
  if (count === 2) {
    layout.style.removeProperty("--he-col-count")
  } else {
    layout.style.setProperty("--he-col-count", String(count))
  }
  if (layout.getAttribute("style") === "") layout.removeAttribute("style")
}

export function applyColumnOp(
  doc: Document,
  el: Element,
  op: ColumnOp
): Element | null {
  const ctx = getColumnContext(el)
  if (!ctx) return null
  const { layout, column, columns } = ctx

  switch (op) {
    case "add-col-left": {
      const next = makeColumn(doc)
      layout.insertBefore(next, column)
      syncColumnCount(layout)
      return next
    }
    case "add-col-right": {
      const next = makeColumn(doc)
      layout.insertBefore(next, column.nextSibling)
      syncColumnCount(layout)
      return next
    }
    case "delete-col": {
      if (columns.length <= 1) return null
      const next =
        (column.nextElementSibling as Element | null) ??
        (column.previousElementSibling as Element | null) ??
        layout
      column.remove()
      syncColumnCount(layout)
      return next
    }
    default:
      return column
  }
}
