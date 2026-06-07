import type { RefObject } from "react";
import { FileText, FolderOpen, Minimize2 } from "lucide-react";
import type { Deck } from "../../shared/types";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type ViewerSectionProps = {
  deck: Deck | null;
  focusMode: boolean;
  viewerHostRef: RefObject<HTMLDivElement | null>;
  onOpenFolder: () => void;
  onFocusModeDisable: () => void;
};

export function ViewerSection({
  deck,
  focusMode,
  viewerHostRef,
  onOpenFolder,
  onFocusModeDisable
}: ViewerSectionProps) {
  return (
    <section
      className={cn(
        "relative h-full min-h-0 min-w-0 overflow-hidden border bg-card",
        focusMode && "border-0"
      )}
    >
      {!deck ? (
        <div className="absolute inset-0 z-1 grid place-content-center gap-4 p-10 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <FileText className="size-7" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">SpecDeck</h1>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              PPT-like viewer and editor for HTML specifications
            </p>
          </div>
          <div className="flex justify-center">
            <Button onClick={onOpenFolder}>
              <FolderOpen />
              フォルダを開く
            </Button>
          </div>
        </div>
      ) : null}
      <div ref={viewerHostRef} className="absolute inset-0" />
      {focusMode ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="secondary"
                size="icon"
                className="absolute top-3 right-3 z-2 shadow-md"
                aria-label="集中モードを解除"
                onClick={onFocusModeDisable}
              >
                <Minimize2 />
              </Button>
            }
          />
          <TooltipContent side="left">集中モードを解除 (Esc)</TooltipContent>
        </Tooltip>
      ) : null}
    </section>
  );
}
