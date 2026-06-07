import { FileImage, FolderOpen, ImageDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface PasteImageDialogProps {
  file: File | null
  canSaveFile: boolean
  busy: boolean
  onCancel: () => void
  onEmbed: () => void
  onSave: (chooseDirectory: boolean) => void
}

export function PasteImageDialog({
  file,
  canSaveFile,
  busy,
  onCancel,
  onEmbed,
  onSave,
}: PasteImageDialogProps) {
  return (
    <Dialog
      open={!!file}
      onOpenChange={(open) => {
        if (!open && !busy) onCancel()
      }}
    >
      <DialogContent
        className="sm:max-w-lg"
        showCloseButton={!busy}
        data-testid="paste-image-dialog"
      >
        <DialogHeader>
          <DialogTitle>画像を貼り付け</DialogTitle>
          <DialogDescription>
            {file?.name || "クリップボード画像"}を HTML
            に埋め込むか、ファイルとして保存します。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-xs text-muted-foreground">
          <p>
            ファイル保存では前回の保存先を再利用します。「保存先を選んで保存」で変更できます。
          </p>
          <p>
            初回は、HTML と保存先の両方を含むプロジェクトフォルダも選択します。
          </p>
          {!canSaveFile && (
            <p className="text-destructive" data-testid="paste-image-save-help">
              ファイル保存を使うには、先に HTML ファイルを Chrome / Edge
              で開くか保存してください。
            </p>
          )}
        </div>

        <DialogFooter className="sm:flex-wrap">
          <DialogClose render={<Button variant="outline" disabled={busy} />}>
            キャンセル
          </DialogClose>
          <Button
            variant="outline"
            disabled={busy}
            onClick={onEmbed}
            data-testid="paste-image-base64"
          >
            <FileImage /> base64で埋め込む
          </Button>
          <Button
            variant="outline"
            disabled={busy || !canSaveFile}
            onClick={() => onSave(true)}
            data-testid="paste-image-choose-save"
          >
            <FolderOpen /> 保存先を選んで保存
          </Button>
          <Button
            disabled={busy || !canSaveFile}
            onClick={() => onSave(false)}
            data-testid="paste-image-save"
          >
            <ImageDown /> ファイルとして保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
