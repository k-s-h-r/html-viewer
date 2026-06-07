export type GridColumnCount = 1 | 2 | 3 | 4

export function getGridElement(el: Element): HTMLElement | null {
  return el.closest(".he-grid") as HTMLElement | null
}

export function setGridColumnCount(
  el: Element,
  count: GridColumnCount
): HTMLElement | null {
  const grid = getGridElement(el)
  if (!grid) return null
  if (count === 2) {
    grid.style.removeProperty("--he-grid-col-count")
  } else {
    grid.style.setProperty("--he-grid-col-count", String(count))
  }
  if (grid.getAttribute("style") === "") grid.removeAttribute("style")
  return grid
}
