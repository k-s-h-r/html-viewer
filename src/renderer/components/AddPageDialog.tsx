import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AddPageDialogProps = {
  open: boolean;
  defaultTitle?: string;
  defaultFileName?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: { title: string; relativePath: string }) => Promise<void>;
};

function slugifyTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "new-page";
}

export function AddPageDialog({
  open,
  defaultTitle = "",
  defaultFileName,
  onOpenChange,
  onSubmit
}: AddPageDialogProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [fileName, setFileName] = useState(defaultFileName ?? "");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setTitle(defaultTitle);
    setFileName(defaultFileName ?? (defaultTitle ? `${slugifyTitle(defaultTitle)}.html` : ""));
  }, [defaultFileName, defaultTitle, open]);

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (!fileName || fileName === `${slugifyTitle(title)}.html`) {
      setFileName(value ? `${slugifyTitle(value)}.html` : "");
    }
  };

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    const trimmedFileName = fileName.trim();
    if (!trimmedTitle || !trimmedFileName) {
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        title: trimmedTitle,
        relativePath: trimmedFileName
      });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>ページを追加</DialogTitle>
          <DialogDescription>
            新しい HTML ページを作成し、目次に登録します。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="add-page-title">タイトル</Label>
            <Input
              id="add-page-title"
              value={title}
              onChange={(event) => handleTitleChange(event.currentTarget.value)}
              placeholder="新しいページ"
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="add-page-filename">ファイル名</Label>
            <Input
              id="add-page-filename"
              value={fileName}
              onChange={(event) => setFileName(event.currentTarget.value)}
              placeholder="new-page.html"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            キャンセル
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={submitting || !title.trim() || !fileName.trim()}
          >
            追加
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
