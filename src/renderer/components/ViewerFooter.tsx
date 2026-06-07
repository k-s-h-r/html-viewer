import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus
} from "lucide-react";
import type { Deck } from "../../shared/types";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip";

type ViewerFooterProps = {
  deck: Deck | null;
  selectedPageNumber: number;
  navigablePageCount: number;
  zoom: number;
  onNavigateByOffset: (offset: number) => void;
  onSetZoomFactor: (zoom: number) => void;
};

export function ViewerFooter({
  deck,
  selectedPageNumber,
  navigablePageCount,
  zoom,
  onNavigateByOffset,
  onSetZoomFactor
}: ViewerFooterProps) {
  return (
    <footer
      data-testid="viewer-footer"
      className="flex h-6 shrink-0 items-center justify-between border-t bg-background px-2"
    >
      <div className="flex items-center gap-0.5">
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

      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="縮小"
          onClick={() => void onSetZoomFactor(zoom - 0.1)}
        >
          <Minus />
        </Button>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="xs"
                className="min-w-[40px] px-1 tabular-nums"
                onClick={() => void onSetZoomFactor(1)}
              >
                {Math.round(zoom * 100)}%
              </Button>
            }
          />
          <TooltipContent side="top">100%に戻す</TooltipContent>
        </Tooltip>
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
