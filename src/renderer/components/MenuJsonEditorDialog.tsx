import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";

type MenuJsonEditorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoad: () => Promise<string>;
  onSave: (text: string) => Promise<void>;
};

export function MenuJsonEditorDialog({
  open,
  onOpenChange,
  onLoad,
  onSave
}: MenuJsonEditorDialogProps) {
  const [text, setText] = useState("");
  const [initialText, setInitialText] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = useMemo(() => text !== initialText, [initialText, text]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setLoading(true);
    setError(null);
    void onLoad()
      .then((loaded) => {
        setText(loaded);
        setInitialText(loaded);
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [onLoad, open]);

  const requestClose = (nextOpen: boolean) => {
    if (!nextOpen && dirty && !confirm("未保存の変更があります。破棄しますか？")) {
      return;
    }
    onOpenChange(nextOpen);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(text);
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>menu.json を編集</DialogTitle>
          <DialogDescription>
            目次定義を JSON で直接編集します。保存時に整形されます。
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-8 text-sm text-muted-foreground">読み込み中...</p>
        ) : (
          <textarea
            value={text}
            onChange={(event) => setText(event.currentTarget.value)}
            spellCheck={false}
            className="min-h-[360px] flex-1 resize-y rounded-lg border bg-background p-3 font-mono text-sm leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            data-testid="menu-json-editor"
          />
        )}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => requestClose(false)} disabled={saving}>
            キャンセル
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving || loading || !dirty}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
