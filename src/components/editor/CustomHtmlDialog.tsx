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

interface CustomHtmlDialogProps {
  disabled?: boolean
  onInsert: (html: string) => void
}

const EXAMPLE_HTML =
  '<svg viewBox="0 0 120 40" role="img" aria-label="sample"><rect width="120" height="40" rx="6" fill="#e0f2fe"/><text x="60" y="25" text-anchor="middle" font-size="14">SVG</text></svg>'

export function CustomHtmlDialog({
  disabled = false,
  onInsert,
}: CustomHtmlDialogProps) {
  const [open, setOpen] = useState(false)
  const [html, setHtml] = useState("")
  const validation = useMemo(
    () => validateCustomHtmlElement(document, html),
    [html]
  )
  const error = html.trim() && !validation.ok ? validation.message : null

  const handleSubmit = () => {
    if (!validation.ok) return
    onInsert(html)
    setHtml("")
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            disabled={disabled}
            data-testid="custom-html-open"
          />
        }
      >
        <Code2 /> HTML を挿入
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>任意 HTML を挿入</DialogTitle>
          <DialogDescription>
            SVG など、body 内に置く単一ルート要素を挿入します。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <textarea
            className="min-h-44 w-full resize-y rounded-lg border border-input bg-background p-2.5 font-mono text-sm leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            placeholder={EXAMPLE_HTML}
            spellCheck={false}
            data-testid="custom-html-input"
            aria-label="挿入する HTML"
            aria-invalid={!!error}
          />
          {error && (
            <p
              className="text-xs text-destructive"
              role="alert"
              data-testid="custom-html-error"
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
            data-testid="custom-html-submit"
          >
            挿入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
