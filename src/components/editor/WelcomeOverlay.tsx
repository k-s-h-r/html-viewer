import { FilePlus2, FolderOpen } from "lucide-react"

import { Button } from "@/components/ui/button"

interface WelcomeOverlayProps {
  fsaSupported: boolean
  onOpen: () => void
  onNew: () => void
}

export function WelcomeOverlay({
  fsaSupported,
  onOpen,
  onNew,
}: WelcomeOverlayProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-muted/40 backdrop-blur-sm">
      <div className="flex max-w-md flex-col items-center gap-4 rounded-xl border bg-background p-8 text-center shadow-sm">
        <h2 className="text-lg font-semibold">SpecDeck Editor</h2>
        <p className="text-sm text-muted-foreground">
          既存の HTML を読み込んで編集するか、新しい HTML
          を作成してください。保存はこの画面から HTML ファイルへ書き出します。
        </p>
        <div className="flex gap-2">
          <Button onClick={onOpen} data-testid="welcome-open">
            <FolderOpen /> HTML を開く
          </Button>
          <Button variant="outline" onClick={onNew} data-testid="welcome-new">
            <FilePlus2 /> 新規作成
          </Button>
        </div>
        {!fsaSupported && (
          <p className="text-[11px] text-muted-foreground">
            ※
            このブラウザは直接上書き保存に未対応のため、保存時はダウンロードになります（Chrome
            / Edge 推奨）。
          </p>
        )}
      </div>
    </div>
  )
}
