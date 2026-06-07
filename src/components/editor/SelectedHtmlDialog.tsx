import { useMemo, useState } from "react"
import { Code2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { validateCustomHtmlElement } from "@/editor/customHtml"

interface SelectedHtmlDialogProps {
  disabled?: boolean
  getHtml: () => string | null
  onApply: (html: string) => boolean
}

export function SelectedHtmlDialog({
  disabled = false,
  getHtml,
  onApply,
}: SelectedHtmlDialogProps) {
  const [open, setOpen] = useState(false)
  const [html, setHtml] = useState("")

  const validation = useMemo(
    () => validateCustomHtmlElement(document, html),
    [html]
  )
  const error = html.trim() && !validation.ok ? validation.message : null

  const handleOpenChange = (next: boolean) => {
    if (next) setHtml(getHtml() ?? "")
    setOpen(next)
  }

  const handleSubmit = () => {
    if (!validation.ok) return
    if (!onApply(html)) return
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            data-testid="selected-html-open"
          />
        }
      >
        <Code2 /> HTML を編集
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>選択要素の HTML を編集</DialogTitle>
          <DialogDescription>
            選択中の要素を、単一ルート要素の HTML で置き換えます。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <textarea
            className="min-h-56 w-full resize-y rounded-lg border border-input bg-background p-2.5 font-mono text-sm leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            spellCheck={false}
            data-testid="selected-html-input"
            aria-label="選択要素の HTML"
            aria-invalid={!!error}
          />
          {error && (
            <p
              className="text-xs text-destructive"
              role="alert"
              data-testid="selected-html-error"
            >
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            キャンセル
          </DialogClose>
          <Button
            disabled={!validation.ok}
            onClick={handleSubmit}
            data-testid="selected-html-submit"
          >
            適用
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
