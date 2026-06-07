import { useCallback, useState } from "react"

const HISTORY_LIMIT = 100

interface History {
  stack: string[]
  index: number
}

export function pushDocumentHistory(
  prev: History,
  cleanHtml: string
): History {
  if (prev.index >= 0 && prev.stack[prev.index] === cleanHtml) return prev
  const base = prev.stack.slice(0, prev.index + 1)
  base.push(cleanHtml)
  const capped = base.slice(-HISTORY_LIMIT)
  return { stack: capped, index: capped.length - 1 }
}

export function useDocumentHistory() {
  const [history, setHistory] = useState<History>({ stack: [], index: -1 })
  const [savedHtml, setSavedHtml] = useState<string | null>(null)

  const hasDocument = history.stack.length > 0
  const canUndo = history.index > 0
  const canRedo = history.index < history.stack.length - 1
  const currentHtml = history.index >= 0 ? history.stack[history.index] : null
  const dirty = currentHtml !== null && currentHtml !== savedHtml

  const resetHistory = useCallback((html: string) => {
    setHistory({ stack: [html], index: 0 })
    setSavedHtml(html)
  }, [])

  const pushHistory = useCallback((cleanHtml: string) => {
    setHistory((prev) => pushDocumentHistory(prev, cleanHtml))
  }, [])

  const replaceCurrentHistory = useCallback((html: string) => {
    setHistory((prev) => {
      if (prev.index < 0) return { stack: [html], index: 0 }
      const stack = [...prev.stack]
      stack[prev.index] = html
      return { stack, index: prev.index }
    })
  }, [])

  const markClean = useCallback((html?: string) => {
    if (html !== undefined) {
      setSavedHtml(html)
      return
    }
    setSavedHtml((currentSavedHtml) => {
      const current = history.index >= 0 ? history.stack[history.index] : null
      return current ?? currentSavedHtml
    })
  }, [history])

  const undo = useCallback((loadHtml: (html: string) => void) => {
    setHistory((prev) => {
      if (prev.index <= 0) return prev
      const nextIndex = prev.index - 1
      requestAnimationFrame(() => loadHtml(prev.stack[nextIndex]))
      return { ...prev, index: nextIndex }
    })
  }, [])

  const redo = useCallback((loadHtml: (html: string) => void) => {
    setHistory((prev) => {
      if (prev.index >= prev.stack.length - 1) return prev
      const nextIndex = prev.index + 1
      requestAnimationFrame(() => loadHtml(prev.stack[nextIndex]))
      return { ...prev, index: nextIndex }
    })
  }, [])

  return {
    dirty,
    markClean,
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
