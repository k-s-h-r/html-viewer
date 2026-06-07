/** 修飾キー+クリックでの選択集合トグル結果 */
export interface SelectionMembers {
  primary: Element | null
  extras: Element[]
}

/**
 * 修飾キー+クリックで target を選択集合に追加/除去する。
 * 追加時は target が primary、既存 primary/extras は extras へ。
 * primary 除去時は extras の末尾を新 primary に昇格。
 */
export function toggleSelectionMember(
  primary: Element | null,
  extras: Element[],
  target: Element
): SelectionMembers {
  const inPrimary = primary === target
  const extraIndex = extras.indexOf(target)

  if (!inPrimary && extraIndex === -1) {
    const nextExtras = primary ? [primary, ...extras] : [...extras]
    return { primary: target, extras: nextExtras.filter((e) => e !== target) }
  }

  if (inPrimary) {
    if (extras.length === 0) return { primary: null, extras: [] }
    const nextPrimary = extras[extras.length - 1]
    return { primary: nextPrimary, extras: extras.slice(0, -1) }
  }

  return {
    primary,
    extras: extras.filter((_, i) => i !== extraIndex),
  }
}

/** 選択数(primary + extras) */
export function selectionCount(
  primary: Element | null,
  extras: Element[]
): number {
  return (primary ? 1 : 0) + extras.length
}
