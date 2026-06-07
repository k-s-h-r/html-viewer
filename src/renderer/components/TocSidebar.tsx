import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { ChevronRight, PanelLeftClose } from "lucide-react";
import type { Deck, DeckPage } from "../../shared/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { canNavigate, pageIcon, statusLabel } from "../pageUtils";

type TocSidebarProps = {
  deck: Deck | null;
  selectedPath: string | null;
  selectedHash: string | null;
  expandedPages: Set<string>;
  onToggleExpanded: (pageId: string) => void;
  onNavigateTo: (page: DeckPage, href?: string, retainUiFocus?: boolean) => Promise<void>;
  onNavigateByOffset: (offset: number) => void;
  onClose: () => void;
};

export function TocSidebar({
  deck,
  selectedPath,
  selectedHash,
  expandedPages,
  onToggleExpanded,
  onNavigateTo,
  onNavigateByOffset,
  onClose
}: TocSidebarProps) {
  const sidebarRef = useRef<HTMLElement>(null);
  const selectedPageButtonRef = useRef<HTMLButtonElement | null>(null);
  const sidebarFocusedRef = useRef(false);
  const pendingRefocusRef = useRef(false);

  const refocusSelectedPage = useCallback(() => {
    const button = selectedPageButtonRef.current;
    if (!button) {
      return;
    }
    button.focus({ preventScroll: true });
    button.scrollIntoView({ block: "nearest" });
  }, []);

  useLayoutEffect(() => {
    if (!pendingRefocusRef.current) {
      return;
    }
    refocusSelectedPage();
  }, [selectedPath, refocusSelectedPage]);

  useEffect(() => {
    return window.viewerApi.onUiFocusRestored(() => {
      pendingRefocusRef.current = false;
      sidebarFocusedRef.current = true;
      refocusSelectedPage();
    });
  }, [refocusSelectedPage]);

  const handleSidebarKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter") {
      const button =
        event.target instanceof HTMLElement
          ? event.target.closest<HTMLButtonElement>("[data-reading-target]")
          : null;
      if (!button || button.disabled) {
        return;
      }
      event.preventDefault();
      sidebarFocusedRef.current = false;
      pendingRefocusRef.current = false;

      void (async () => {
        if (button.dataset.pageId) {
          const page = deck?.pages.find((candidate) => candidate.id === button.dataset.pageId);
          if (page && canNavigate(page) && button.dataset.testid !== "selected-page-button") {
            await onNavigateTo(page, page.href, false);
          }
        } else {
          button.click();
          await new Promise((resolve) => window.setTimeout(resolve, 0));
        }
        await window.viewerApi.focusDocument();
      })();
      return;
    }

    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return;
    }
    event.preventDefault();
    pendingRefocusRef.current = true;
    onNavigateByOffset(event.key === "ArrowDown" ? 1 : -1);
  };

  return (
    <aside
      ref={sidebarRef}
      data-testid="toc-sidebar"
      className="flex w-72 shrink-0 flex-col overflow-hidden border bg-card"
      onFocusCapture={() => {
        sidebarFocusedRef.current = true;
      }}
      onBlurCapture={(event) => {
        if (sidebarRef.current?.contains(event.relatedTarget as Node | null)) {
          return;
        }
        sidebarFocusedRef.current = false;
      }}
      onKeyDown={handleSidebarKeyDown}
    >
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <span className="truncate text-sm font-semibold">
          {deck?.rootName ?? "仕様書未選択"}
        </span>
        <div className="flex items-center gap-1.5">
          {deck ? (
            <Badge variant="secondary" className="shrink-0">
              {deck.hasToc ? "目次" : "フォールバック"}
            </Badge>
          ) : null}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="目次を閉じる"
                  onClick={onClose}
                >
                  <PanelLeftClose />
                </Button>
              }
            />
            <TooltipContent side="right">目次を閉じる</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-0.5 p-2">
          {deck ? (
            deck.pages.map((page, index) => {
              const isSelected = page.path === selectedPath;
              const isExpanded = expandedPages.has(page.id);
              const disabled = !canNavigate(page);
              return (
                <div key={page.id} data-testid="page-row">
                  <div className="group/row relative flex items-stretch">
                    <button
                      type="button"
                      disabled={disabled}
                      ref={(element) => {
                        if (isSelected) {
                          selectedPageButtonRef.current = element;
                        }
                      }}
                      data-testid={isSelected ? "selected-page-button" : undefined}
                      data-page-id={page.id}
                      data-reading-target=""
                      onClick={() => {
                        pendingRefocusRef.current = true;
                        void onNavigateTo(page, page.href, true);
                      }}
                      className={cn(
                        "flex min-h-[52px] w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
                        page.anchors.length > 0 ? "pr-9" : "pr-2",
                        disabled
                          ? "cursor-not-allowed opacity-50"
                          : "hover:bg-accent",
                        isSelected && "bg-accent"
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold tabular-nums",
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {index + 1}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium">{page.title}</span>
                        <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                          {pageIcon(page)}
                          <span className="truncate">{statusLabel(page)}</span>
                        </span>
                      </span>
                    </button>
                    {page.anchors.length > 0 ? (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="アンカーを表示"
                        className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground"
                        onClick={() => onToggleExpanded(page.id)}
                      >
                        <ChevronRight
                          className={cn("transition-transform", isExpanded && "rotate-90")}
                        />
                      </Button>
                    ) : null}
                  </div>
                  {isExpanded ? (
                    <div className="ml-[26px] flex flex-col gap-0.5 border-l py-0.5 pl-2">
                      {page.anchors.map((anchor) => {
                        const anchorSelected = isSelected && selectedHash === anchor.hash;
                        return (
                          <button
                            key={anchor.id}
                            type="button"
                            data-reading-target=""
                            onClick={() => void onNavigateTo(page, anchor.href, false)}
                            className={cn(
                              "truncate rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                              anchorSelected
                                ? "bg-accent font-medium text-accent-foreground"
                                : "text-muted-foreground"
                            )}
                          >
                            {anchor.title}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })
          ) : (
            <p className="px-3 py-6 text-sm text-muted-foreground">
              フォルダを開くと、目次からページ一覧を生成します。
            </p>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
