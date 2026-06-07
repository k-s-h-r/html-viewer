import { useCallback, useState } from "react"

import { validateSourceHtml } from "@/editor/sourceValidate"

interface SourceSnapshot {
  html: string
  scrollOffset: number | null
}

export function useSourceMode() {
  const [sourceText, setSourceText] = useState("")
  const [sourceBaseline, setSourceBaseline] = useState("")
  const [sourceError, setSourceError] = useState<string | null>(null)
  const [sourceScrollOffset, setSourceScrollOffset] = useState<number | null>(
    null
  )
  const [sourceScrollToken, setSourceScrollToken] = useState(0)

  const sourceDirty = sourceText !== sourceBaseline

  const resetSource = useCallback(() => {
    setSourceText("")
    setSourceBaseline("")
    setSourceError(null)
    setSourceScrollOffset(null)
    setSourceScrollToken(0)
  }, [])

  const showSourceSnapshot = useCallback((snapshot: SourceSnapshot) => {
    setSourceText(snapshot.html)
    setSourceBaseline(snapshot.html)
    setSourceScrollOffset(snapshot.scrollOffset)
    setSourceScrollToken((token) => token + 1)
    setSourceError(null)
  }, [])

  const updateSourceText = useCallback(
    (text: string) => {
      setSourceText(text)
      if (sourceError) setSourceError(null)
    },
    [sourceError]
  )

  const applySourceText = useCallback(
    (
      loadHtml: (html: string) => void,
      getCleanHtml: () => string | undefined,
      onNormalized: (html: string) => void
    ): string | null => {
      const result = validateSourceHtml(sourceText)
      if (!result.ok) {
        setSourceError(result.message)
        return null
      }

      loadHtml(sourceText)
      const normalized = getCleanHtml() ?? sourceText
      setSourceText(normalized)
      setSourceBaseline(normalized)
      setSourceError(null)
      onNormalized(normalized)
      return normalized
    },
    [sourceText]
  )

  return {
    sourceText,
    sourceDirty,
    sourceError,
    sourceScrollOffset,
    sourceScrollToken,
    resetSource,
    showSourceSnapshot,
    updateSourceText,
    applySourceText,
  }
}
