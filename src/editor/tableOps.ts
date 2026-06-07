export type TableOp =
  | "add-row-above"
  | "add-row-below"
  | "delete-row"
  | "add-col-left"
  | "add-col-right"
  | "delete-col"
  | "toggle-header"

interface TableContext {
  table: HTMLTableElement
  row: HTMLTableRowElement
  cell: HTMLTableCellElement
  cellIndex: number
}

export function getTableContext(el: Element): TableContext | null {
  const table = el.closest("table") as HTMLTableElement | null
  if (!table) return null

  // 選択要素に応じて基準セルを解決する。
  // 1. td/th(またはその内側) → その closest セル
  // 2. tr(またはセルまで辿れない行内) → その行の先頭セル
  // 3. それ以外(table/tbody 直接選択など) → 表の先頭セル
  const cell = el.closest("td, th") as HTMLTableCellElement | null
  let resolvedCell = cell
  if (!resolvedCell) {
    const tr = el.closest("tr") as HTMLTableRowElement | null
    resolvedCell =
      (tr?.firstElementChild as HTMLTableCellElement | null) ?? null
  }
  if (!resolvedCell) {
    resolvedCell = table.querySelector("td, th") as HTMLTableCellElement | null
  }
  if (!resolvedCell) return null

  const row = resolvedCell.parentElement as HTMLTableRowElement
  const cellIndex = Array.prototype.indexOf.call(row.children, resolvedCell)
  return { table, row, cell: resolvedCell, cellIndex }
}

export function allRows(table: HTMLTableElement): HTMLTableRowElement[] {
  // ネストした内側テーブルの行を除外し、この table 直属の行だけを対象にする
  return Array.from(table.querySelectorAll("tr")).filter(
    (tr) => tr.closest("table") === table
  )
}

export function applyTableOp(
  doc: Document,
  el: Element,
  op: TableOp
): Element | null {
  const ctx = getTableContext(el)
  if (!ctx) return null
  const { table, row, cellIndex } = ctx

  const makeCell = (tag: "td" | "th") => {
    const c = doc.createElement(tag)
    c.textContent = " "
    return c
  }

  switch (op) {
    case "add-row-above":
    case "add-row-below": {
      const newRow = doc.createElement("tr")
      const colCount = row.children.length
      const useTh = Array.from(row.children).every(
        (c) => c.tagName.toLowerCase() === "th"
      )
      for (let i = 0; i < colCount; i++) {
        newRow.appendChild(makeCell(useTh ? "th" : "td"))
      }
      row.parentElement?.insertBefore(
        newRow,
        op === "add-row-above" ? row : row.nextSibling
      )
      return newRow.firstElementChild
    }
    case "delete-row": {
      // 最後の1行は削除しない(空テーブルになって復旧不能になるのを防ぐ)
      const rows = allRows(table)
      if (rows.length <= 1) return null
      const rowIndex = rows.indexOf(row)
      const next = rows[rowIndex + 1] ?? rows[rowIndex - 1] ?? null
      row.remove()
      return next
    }
    case "add-col-left":
    case "add-col-right": {
      for (const r of allRows(table)) {
        const ref = r.children[cellIndex] ?? null
        const isHeaderRow = Array.from(r.children).every(
          (c) => c.tagName.toLowerCase() === "th"
        )
        const cell = makeCell(isHeaderRow ? "th" : "td")
        r.insertBefore(
          cell,
          op === "add-col-left" ? ref : ref ? ref.nextSibling : null
        )
      }
      return ctx.cell
    }
    case "delete-col": {
      // 最後の1列は削除しない(空テーブルになって復旧不能になるのを防ぐ)
      const colCount = allRows(table).reduce(
        (max, r) => Math.max(max, r.children.length),
        ctx.row.children.length
      )
      if (colCount <= 1) return null
      for (const r of allRows(table)) {
        const c = r.children[cellIndex]
        if (c) c.remove()
      }
      return table.querySelector("td, th")
    }
    case "toggle-header": {
      // 先頭行の td <-> th を切り替える(ネストした内側テーブルの行は対象外)
      const firstRow = allRows(table)[0] ?? null
      if (!firstRow) return ctx.cell
      const isHeader =
        firstRow.firstElementChild?.tagName.toLowerCase() === "th"
      for (const c of Array.from(firstRow.children)) {
        const replacement = doc.createElement(isHeader ? "td" : "th")
        replacement.innerHTML = c.innerHTML
        for (const name of c.getAttributeNames()) {
          replacement.setAttribute(name, c.getAttribute(name) ?? "")
        }
        c.replaceWith(replacement)
      }
      return table.querySelector("td, th")
    }
    default:
      return ctx.cell
  }
}
