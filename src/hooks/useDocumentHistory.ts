import { useCallback, useState } from "react"

const HISTORY_LIMIT = 100

interface History {
  stack: string[]
  index: number
}

export function useDocumentHistory() {
  const [history, setHistory] = useState<History>({ stack: [], index: -1 })
  const [dirty, setDirty] = useState(false)

  const hasDocument = history.stack.length > 0
  const canUndo = history.index > 0
  const canRedo = history.index < history.stack.length - 1

  const resetHistory = useCallback((html: string) => {
    setHistory({ stack: [html], index: 0 })
    setDirty(false)
  }, [])

  const pushHistory = useCallback((cleanHtml: string) => {
    setHistory((prev) => {
      const base = prev.stack.slice(0, prev.index + 1)
      base.push(cleanHtml)
      const capped = base.slice(-HISTORY_LIMIT)
      return { stack: capped, index: capped.length - 1 }
    })
    setDirty(true)
  }, [])

  const replaceCurrentHistory = useCallback((html: string) => {
    setHistory((prev) => {
      if (prev.index < 0) return { stack: [html], index: 0 }
      const stack = [...prev.stack]
      stack[prev.index] = html
      return { stack, index: prev.index }
    })
  }, [])

  const undo = useCallback((loadHtml: (html: string) => void) => {
    setHistory((prev) => {
      if (prev.index <= 0) return prev
      const nextIndex = prev.index - 1
      requestAnimationFrame(() => loadHtml(prev.stack[nextIndex]))
      return { ...prev, index: nextIndex }
    })
    setDirty(true)
  }, [])

  const redo = useCallback((loadHtml: (html: string) => void) => {
    setHistory((prev) => {
      if (prev.index >= prev.stack.length - 1) return prev
      const nextIndex = prev.index + 1
      requestAnimationFrame(() => loadHtml(prev.stack[nextIndex]))
      return { ...prev, index: nextIndex }
    })
    setDirty(true)
  }, [])

  return {
    dirty,
    setDirty,
    hasDocument,
    canUndo,
    canRedo,
    resetHistory,
    pushHistory,
    replaceCurrentHistory,
    undo,
    redo,
  }
}
