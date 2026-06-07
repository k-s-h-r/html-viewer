import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus
} from "lucide-react";
import type { Deck } from "../../shared/types";
import { Button } from "@/components/ui/button";

type ViewerFooterProps = {
  deck: Deck | null;
  documentPath: string | null;
  selectedPageNumber: number;
  navigablePageCount: number;
  zoom: number;
  onNavigateByOffset: (offset: number) => void;
  onSetZoomFactor: (zoom: number) => void;
};

export function ViewerFooter({
  deck,
  documentPath,
  selectedPageNumber,
  navigablePageCount,
  zoom,
  onNavigateByOffset,
  onSetZoomFactor
}: ViewerFooterProps) {
  return (
    <footer
      data-testid="viewer-footer"
      className="flex h-6 shrink-0 items-center gap-2 border-t bg-background px-2"
    >
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={!deck}
          aria-label="前のページ"
          onClick={() => onNavigateByOffset(-1)}
        >
          <ChevronLeft />
        </Button>
        <span className="min-w-[48px] text-center text-xs tabular-nums text-muted-foreground">
          {selectedPageNumber || "-"} / {navigablePageCount || "-"}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={!deck}
          aria-label="次のページ"
          onClick={() => onNavigateByOffset(1)}
        >
          <ChevronRight />
        </Button>
      </div>

      <span
        data-testid="document-path"
        aria-label={documentPath ?? undefined}
        dir="rtl"
        className="block min-w-0 flex-1 truncate text-center font-mono text-xs text-muted-foreground"
      >
        <bdi dir="ltr" aria-hidden="true">
          {documentPath ?? ""}
        </bdi>
      </span>

      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="縮小"
          onClick={() => void onSetZoomFactor(zoom - 0.1)}
        >
          <Minus />
        </Button>
        <Button
          variant="ghost"
          size="xs"
          className="min-w-[40px] px-1 tabular-nums"
          aria-label="100%に戻す"
          onClick={() => void onSetZoomFactor(1)}
        >
          {Math.round(zoom * 100)}%
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="拡大"
          onClick={() => void onSetZoomFactor(zoom + 0.1)}
        >
          <Plus />
        </Button>
      </div>
    </footer>
  );
}
