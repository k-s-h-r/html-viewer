import { useEffect, useRef } from "react"
import { Check, Copy } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { scrollTextareaToOffset } from "@/editor/sourceScroll"

interface SourcePanelProps {
  text: string
  sourceDirty: boolean
  error: string | null
  /** モード切替直後に選択要素付近へスクロールする文字オフセット */
  scrollToOffset: number | null
  scrollToken: number
  onTextChange: (text: string) => void
  onApply: () => void
}

export function SourcePanel({
  text,
  sourceDirty,
  error,
  scrollToOffset,
  scrollToken,
  onTextChange,
  onApply,
}: SourcePanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (scrollToOffset == null) return
    const ta = textareaRef.current
    if (!ta) return
    requestAnimationFrame(() => {
      scrollTextareaToOffset(ta, scrollToOffset)
    })
  }, [scrollToOffset, scrollToken])
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success("クリップボードにコピーしました")
    } catch {
      toast.error("コピーに失敗しました")
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <Button
          size="sm"
          disabled={!sourceDirty}
          onClick={onApply}
          data-testid="source-apply"
        >
          <Check /> 適用
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleCopy()}
          data-testid="source-copy"
        >
          <Copy /> コピー
        </Button>
        <p className="ml-2 text-xs text-muted-foreground">
          保存時と同じクリーン HTML です。編集ツール用の一時属性は含まれません。
        </p>
      </div>

      {error && (
        <div
          className="shrink-0 border-b bg-destructive/10 px-3 py-2 text-sm text-destructive"
          data-testid="source-error"
          role="alert"
        >
          {error}
        </div>
      )}

      <textarea
        ref={textareaRef}
        className="min-h-0 flex-1 resize-none border-0 bg-background p-3 font-mono text-sm leading-relaxed outline-none focus-visible:ring-0"
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        spellCheck={false}
        data-testid="source-editor"
        aria-label="HTML ソース"
      />
    </div>
  )
}
