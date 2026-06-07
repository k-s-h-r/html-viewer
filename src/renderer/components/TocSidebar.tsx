import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { ChevronDown, PanelLeftClose } from "lucide-react";
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
import {
  canNavigate,
  displayPageNumber,
  flattenDeckPages,
  pageIcon,
  pageMatchesSelection,
  statusLabel
} from "../pageUtils";

type TocSidebarProps = {
  deck: Deck | null;
  selectedPath: string | null;
  selectedHash: string | null;
  expandedPages: Set<string>;
  onToggleExpanded: (pageId: string) => void;
  onNavigateTo: (page: DeckPage, href?: string, openExternal?: boolean) => Promise<void>;
  onNavigateByOffset: (offset: number) => void;
  onClose: () => void;
};

type PageRowProps = {
  page: DeckPage;
  displayNumber: string;
  selectedPath: string | null;
  selectedHash: string | null;
  expandedPages: Set<string>;
  nested?: boolean;
  selectedPageButtonRef: React.MutableRefObject<HTMLButtonElement | null>;
  onToggleExpanded: (pageId: string) => void;
  onNavigateTo: (page: DeckPage, href?: string, openExternal?: boolean) => Promise<void>;
};

function PageRow({
  page,
  displayNumber,
  selectedPath,
  selectedHash,
  expandedPages,
  nested = false,
  selectedPageButtonRef,
  onToggleExpanded,
  onNavigateTo
}: PageRowProps) {
  const isSelected = pageMatchesSelection(page, selectedPath, selectedHash);
  const isExpanded = expandedPages.has(page.id);
  const disabled = !canNavigate(page);
  const hasNestedItems = page.children.length > 0 || page.anchors.length > 0;

  return (
    <div data-testid="page-row">
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
            void onNavigateTo(page, page.href, page.kind === "external");
          }}
          className={cn(
            "flex min-h-[52px] w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
            nested ? "pl-3" : "pl-2",
            hasNestedItems ? "pr-9" : "pr-2",
            disabled ? "cursor-not-allowed opacity-50" : "hover:bg-accent",
            isSelected && "bg-accent"
          )}
        >
          <span
            className={cn(
              "flex shrink-0 items-center justify-center rounded-md text-xs font-semibold tabular-nums",
              nested ? "min-w-7 px-1.5" : "size-7",
              isSelected
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            )}
          >
            {displayNumber}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{page.title}</span>
            <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              {pageIcon(page)}
              <span className="truncate">{statusLabel(page)}</span>
            </span>
          </span>
        </button>
        {hasNestedItems ? (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={page.children.length > 0 ? "子ページを表示" : "アンカーを表示"}
            aria-expanded={isExpanded}
            className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground transition-none active:-translate-y-1/2"
            onClick={() => onToggleExpanded(page.id)}
          >
            <ChevronDown
              className={cn("transition-none", isExpanded && "rotate-180")}
            />
          </Button>
        ) : null}
      </div>
      {isExpanded && page.children.length > 0 ? (
        <div className="ml-[26px] flex flex-col gap-0.5 border-l py-0.5 pl-2">
          {page.children.map((child) => (
            <PageRow
              key={child.id}
              page={child}
              displayNumber={displayPageNumber(child, 0)}
              selectedPath={selectedPath}
              selectedHash={selectedHash}
              expandedPages={expandedPages}
              nested
              selectedPageButtonRef={selectedPageButtonRef}
              onToggleExpanded={onToggleExpanded}
              onNavigateTo={onNavigateTo}
            />
          ))}
        </div>
      ) : null}
      {isExpanded && page.anchors.length > 0 ? (
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
}

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
  const selectedPageButtonRef = useRef<HTMLButtonElement | null>(null);
  const pendingSelectionRefocusRef = useRef(false);
  const allPages = useMemo(
    () => (deck ? flattenDeckPages(deck.pages) : []),
    [deck]
  );

  const refocusSelectedPage = useCallback(() => {
    const button = selectedPageButtonRef.current;
    if (!button) {
      return;
    }
    button.focus({ preventScroll: true });
    button.scrollIntoView({ block: "nearest" });
  }, []);

  useLayoutEffect(() => {
    if (!pendingSelectionRefocusRef.current || !deck) {
      return;
    }

    const selectedPage = allPages.find((page) =>
      pageMatchesSelection(page, selectedPath, selectedHash)
    );
    if (!selectedPage) {
      return;
    }

    const button = selectedPageButtonRef.current;
    if (!button || button.dataset.pageId !== selectedPage.id) {
      return;
    }

    refocusSelectedPage();
    pendingSelectionRefocusRef.current = false;
  }, [allPages, deck, selectedPath, selectedHash, refocusSelectedPage]);

  useEffect(() => {
    return window.viewerApi.onUiFocusRestored(refocusSelectedPage);
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
      pendingSelectionRefocusRef.current = false;

      void (async () => {
        if (button.dataset.pageId) {
          const page = button.dataset.pageId
            ? allPages.find((candidate) => candidate.id === button.dataset.pageId)
            : undefined;
          if (page && canNavigate(page)) {
            if (page.kind === "external") {
              await onNavigateTo(page, page.href, true);
              return;
            }
            if (pageMatchesSelection(page, selectedPath, selectedHash)) {
              await window.viewerApi.focusDocument();
              return;
            }
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
    pendingSelectionRefocusRef.current = true;
    onNavigateByOffset(event.key === "ArrowDown" ? 1 : -1);
  };

  return (
    <aside
      data-testid="toc-sidebar"
      className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border bg-card"
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
            deck.pages.map((page, index) => (
              <PageRow
                key={page.id}
                page={page}
                displayNumber={displayPageNumber(page, index + 1)}
                selectedPath={selectedPath}
                selectedHash={selectedHash}
                expandedPages={expandedPages}
                selectedPageButtonRef={selectedPageButtonRef}
                onToggleExpanded={onToggleExpanded}
                onNavigateTo={onNavigateTo}
              />
            ))
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
