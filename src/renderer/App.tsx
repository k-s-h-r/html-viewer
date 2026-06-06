import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CaseSensitive,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  FileWarning,
  FileX,
  FolderOpen,
  History,
  Maximize2,
  Minimize2,
  Minus,
  PanelLeft,
  Plus,
  Search,
  X
} from "lucide-react";
import type {
  Deck,
  DeckPage,
  FindResult,
  NavigationState,
  RecentFolder,
  SearchResult
} from "../shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatGlobalFindCounter } from "./searchCounter";

const EMPTY_SEARCH: SearchResult = {
  query: "",
  matchCase: false,
  totalHits: 0,
  pages: []
};

type PendingFindTarget = {
  pagePath: string;
  direction: "first" | "last";
  ordinal?: number;
};

function canNavigate(page: DeckPage): boolean {
  return page.kind === "page" || page.kind === "external";
}

function statusLabel(page: DeckPage): string {
  if (page.kind === "missing") {
    return "見つかりません";
  }
  if (page.kind === "out-of-scope") {
    return "範囲外";
  }
  if (page.kind === "external") {
    return "外部リンク";
  }
  return page.path;
}

function pageIcon(page: DeckPage) {
  if (page.kind === "missing") {
    return <FileX className="size-3.5" />;
  }
  if (page.kind === "out-of-scope") {
    return <FileWarning className="size-3.5" />;
  }
  if (page.kind === "external") {
    return <ExternalLink className="size-3.5" />;
  }
  return <FileText className="size-3.5" />;
}

function clampZoom(value: number): number {
  return Math.min(2, Math.max(0.5, Number(value.toFixed(2))));
}

function findPageIndex(deck: Deck | null, selectedPath: string | null): number {
  if (!deck || !selectedPath) {
    return -1;
  }
  return deck.pages.findIndex((page) => page.kind === "page" && page.path === selectedPath);
}

export default function App() {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [recentFolders, setRecentFolders] = useState<RecentFolder[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResult>(EMPTY_SEARCH);
  const [findResult, setFindResult] = useState<FindResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());
  const viewerHostRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const pendingFindTargetRef = useRef<PendingFindTarget | null>(null);

  const navigablePages = useMemo(
    () => deck?.pages.filter((page) => page.kind === "page") ?? [],
    [deck]
  );

  const selectedPageNumber = useMemo(() => {
    const index = findPageIndex(deck, selectedPath);
    return index >= 0 ? index + 1 : 0;
  }, [deck, selectedPath]);

  const applyDeck = useCallback((nextDeck: Deck | null) => {
    setDeck(nextDeck);
    setSearchResult(EMPTY_SEARCH);
    setFindResult(null);
    setSearchQuery("");
    setSubmittedQuery("");
    setSelectedPath(null);
    setSelectedHash(null);
    setExpandedPages(new Set());
  }, []);

  const updateRecentFolders = useCallback(async () => {
    setRecentFolders(await window.viewerApi.getRecentFolders());
  }, []);

  const reportViewBounds = useCallback(() => {
    if (!deck) {
      void window.viewerApi.setViewBounds({ x: 0, y: 0, width: 0, height: 0 });
      return;
    }

    const element = viewerHostRef.current;
    if (!element) {
      return;
    }
    const rect = element.getBoundingClientRect();
    void window.viewerApi.setViewBounds({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    });
  }, [deck]);

  const navigateTo = useCallback(async (page: DeckPage, href = page.href) => {
    if (!canNavigate(page)) {
      return;
    }

    if (page.kind === "external") {
      await window.viewerApi.openExternal(page.href);
      return;
    }

    await window.viewerApi.navigate(href);
  }, []);

  const setZoomFactor = useCallback(async (nextZoom: number) => {
    const clamped = clampZoom(nextZoom);
    setZoom(clamped);
    await window.viewerApi.setZoomFactor(clamped);
  }, []);

  const navigateByOffset = useCallback(
    (offset: number) => {
      if (!deck || navigablePages.length === 0) {
        return;
      }

      const currentIndex = navigablePages.findIndex((page) => page.path === selectedPath);
      const nextIndex = Math.min(
        navigablePages.length - 1,
        Math.max(0, currentIndex + offset)
      );
      const page = navigablePages[nextIndex] ?? navigablePages[0];
      void navigateTo(page);
    },
    [deck, navigablePages, navigateTo, selectedPath]
  );

  const runFind = useCallback(
    (forward: boolean, findNext: boolean) => {
      if (!submittedQuery.trim()) {
        return;
      }
      void window.viewerApi.findInPage({
        query: submittedQuery,
        forward,
        findNext,
        matchCase
      });
    },
    [matchCase, submittedQuery]
  );

  const executeSearch = useCallback(async () => {
    const query = searchQuery.trim();
    if (!query) {
      setSubmittedQuery("");
      setSearchResult(EMPTY_SEARCH);
      setFindResult(null);
      await window.viewerApi.stopFindInPage();
      return;
    }

    const result = await window.viewerApi.search(query, matchCase);
    setSubmittedQuery(query);
    setSearchResult(result);
    void window.viewerApi.findInPage({
      query,
      forward: true,
      findNext: false,
      matchCase
    });
  }, [matchCase, searchQuery]);

  const runFindAtOrdinal = useCallback(
    (ordinal: number) => {
      runFind(true, false);

      for (let step = 1; step < ordinal; step += 1) {
        window.setTimeout(() => runFind(true, true), step * 40);
      }
    },
    [runFind]
  );

  const navigateToSearchTarget = useCallback(
    (pagePath: string, direction: "first" | "last", ordinal?: number) => {
      const page = deck?.pages.find((candidate) => candidate.path === pagePath);
      if (!page) {
        return;
      }

      pendingFindTargetRef.current = { pagePath, direction, ordinal };
      if (pagePath === selectedPath) {
        pendingFindTargetRef.current = null;
        if (ordinal && ordinal > 1) {
          runFindAtOrdinal(ordinal);
        } else {
          runFind(direction === "first", false);
        }
        return;
      }

      void navigateTo(page);
    },
    [deck, navigateTo, runFind, runFindAtOrdinal, selectedPath]
  );

  const navigateSearchAcrossPages = useCallback(
    (forward: boolean) => {
      if (!submittedQuery.trim() || searchResult.pages.length === 0) {
        return;
      }

      const currentIndex = searchResult.pages.findIndex((page) => page.pagePath === selectedPath);
      if (currentIndex < 0) {
        const target = forward
          ? searchResult.pages[0]
          : searchResult.pages[searchResult.pages.length - 1];
        navigateToSearchTarget(target.pagePath, forward ? "first" : "last");
        return;
      }

      const isAtEdge =
        findResult &&
        findResult.matches > 0 &&
        ((forward && findResult.activeMatchOrdinal >= findResult.matches) ||
          (!forward && findResult.activeMatchOrdinal <= 1));

      if (isAtEdge) {
        const nextIndex =
          (currentIndex + (forward ? 1 : -1) + searchResult.pages.length) %
          searchResult.pages.length;
        const target = searchResult.pages[nextIndex];
        navigateToSearchTarget(target.pagePath, forward ? "first" : "last");
        return;
      }

      runFind(forward, true);
    },
    [findResult, navigateToSearchTarget, runFind, searchResult.pages, selectedPath, submittedQuery]
  );

  useEffect(() => {
    void window.viewerApi.getRecentFolders().then(setRecentFolders);
    void window.viewerApi.getCurrentDeck().then((deck) => {
      if (deck) {
        applyDeck(deck);
      }
    });

    const cleanupDeck = window.viewerApi.onDeckChanged((nextDeck) => {
      applyDeck(nextDeck);
      void updateRecentFolders();
    });
    const cleanupNavigation = window.viewerApi.onNavigationChanged((state: NavigationState) => {
      setSelectedPath(state.pagePath ?? null);
      setSelectedHash(state.hash ?? null);
    });
    const cleanupFind = window.viewerApi.onFindResult(setFindResult);
    const cleanupZoom = window.viewerApi.onZoomChanged(setZoom);
    const cleanupFocusSearch = window.viewerApi.onFocusSearch(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });

    return () => {
      cleanupDeck();
      cleanupNavigation();
      cleanupFind();
      cleanupZoom();
      cleanupFocusSearch();
    };
  }, [applyDeck, updateRecentFolders]);

  useEffect(() => {
    reportViewBounds();
    const element = viewerHostRef.current;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver(reportViewBounds);
    observer.observe(element);
    window.addEventListener("resize", reportViewBounds);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", reportViewBounds);
    };
  }, [reportViewBounds, sidebarVisible, focusMode, submittedQuery]);

  useEffect(() => {
    if (selectedPath && submittedQuery.trim()) {
      const pendingFindTarget = pendingFindTargetRef.current;
      if (pendingFindTarget?.pagePath === selectedPath) {
        pendingFindTargetRef.current = null;

        if (pendingFindTarget.ordinal && pendingFindTarget.ordinal > 1) {
          runFindAtOrdinal(pendingFindTarget.ordinal);
          return;
        }

        runFind(pendingFindTarget.direction === "first", false);
        return;
      }

      runFind(true, false);
    }
  }, [runFind, runFindAtOrdinal, selectedPath, submittedQuery]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && focusMode) {
        setFocusMode(false);
      }

      if (event.ctrlKey || event.metaKey) {
        if (event.key.toLowerCase() === "f") {
          event.preventDefault();
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        }
        if (event.key === "=" || event.key === "+") {
          event.preventDefault();
          void setZoomFactor(zoom + 0.1);
        }
        if (event.key === "-") {
          event.preventDefault();
          void setZoomFactor(zoom - 0.1);
        }
        if (event.key === "0") {
          event.preventDefault();
          void setZoomFactor(1);
        }
        return;
      }

      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (event.key === "ArrowRight") {
        navigateByOffset(1);
      }
      if (event.key === "ArrowLeft") {
        navigateByOffset(-1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [focusMode, navigateByOffset, setZoomFactor, zoom]);

  const openFolder = async () => {
    try {
      setError(null);
      const nextDeck = await window.viewerApi.openFolder();
      if (nextDeck) {
        applyDeck(nextDeck);
        await updateRecentFolders();
      }
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : String(openError));
    }
  };

  const openRecentFolder = async (folderPath: string) => {
    try {
      setError(null);
      const nextDeck = await window.viewerApi.openRecentFolder(folderPath);
      if (nextDeck) {
        applyDeck(nextDeck);
        await updateRecentFolders();
      }
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : String(openError));
    }
  };

  const toggleExpanded = (pageId: string) => {
    setExpandedPages((current) => {
      const next = new Set(current);
      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }
      return next;
    });
  };

  const showSidebar = sidebarVisible && !focusMode;
  const showResults = Boolean(submittedQuery.trim()) && searchQuery.trim() === submittedQuery;
  const findCounter = useMemo(
    () => formatGlobalFindCounter(submittedQuery, searchResult, selectedPath, findResult),
    [findResult, searchResult, selectedPath, submittedQuery]
  );

  return (
    <TooltipProvider delay={300}>
      <div
        data-testid="app-shell"
        data-focus-mode={focusMode}
        className="flex h-full w-full min-w-[960px] flex-col overflow-hidden bg-muted/40 text-foreground"
      >
        {!focusMode ? (
          <header
            data-testid="toolbar"
            className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3"
          >
            <div className="flex items-center gap-1.5">
              <Button size="sm" onClick={openFolder}>
                <FolderOpen />
                フォルダを開く
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon-sm"
                      disabled={recentFolders.length === 0}
                      aria-label="最近使ったフォルダ"
                    >
                      <History />
                    </Button>
                  }
                />
                <DropdownMenuContent align="start" side="top" className="w-64">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>最近使ったフォルダ</DropdownMenuLabel>
                    {recentFolders.map((folder) => (
                      <DropdownMenuItem
                        key={folder.path}
                        onClick={() => void openRecentFolder(folder.path)}
                      >
                        <FolderOpen className="text-muted-foreground" />
                        <span className="truncate">{folder.name}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <Separator orientation="vertical" className="mx-1 h-6" />

            <div className="flex min-w-[320px] flex-1 items-center gap-1.5">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  className="pl-8"
                  placeholder="検索...  (Ctrl+F)"
                  value={searchQuery}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setSearchQuery(value);
                    if (!value.trim()) {
                      setSubmittedQuery("");
                      setSearchResult(EMPTY_SEARCH);
                      setFindResult(null);
                      void window.viewerApi.stopFindInPage();
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      if (showResults) {
                        navigateSearchAcrossPages(!event.shiftKey);
                      } else {
                        void executeSearch();
                      }
                    }
                  }}
                />
                {findCounter ? (
                  <span
                    data-testid="find-counter"
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 text-xs tabular-nums text-muted-foreground"
                  >
                    {findCounter}
                  </span>
                ) : null}
              </div>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant={matchCase ? "secondary" : "ghost"}
                      size="icon-sm"
                      aria-pressed={matchCase}
                      onClick={() => setMatchCase((value) => !value)}
                    >
                      <CaseSensitive />
                    </Button>
                  }
                />
                <TooltipContent side="top">大文字小文字を区別</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="検索"
                      disabled={!searchQuery.trim()}
                      onClick={() => void executeSearch()}
                    >
                      <Search />
                    </Button>
                  }
                />
                <TooltipContent side="top">検索 (Enter)</TooltipContent>
              </Tooltip>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={!showResults}
                aria-label="前のヒット"
                onClick={() => navigateSearchAcrossPages(false)}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={!showResults}
                aria-label="次のヒット"
                onClick={() => navigateSearchAcrossPages(true)}
              >
                <ChevronRight />
              </Button>
            </div>

            <Separator orientation="vertical" className="mx-1 h-6" />

            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={!deck}
                aria-label="前のページ"
                onClick={() => navigateByOffset(-1)}
              >
                <ChevronLeft />
              </Button>
              <span className="min-w-[64px] text-center text-sm tabular-nums text-muted-foreground">
                {selectedPageNumber || "-"} / {navigablePages.length || "-"}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={!deck}
                aria-label="次のページ"
                onClick={() => navigateByOffset(1)}
              >
                <ChevronRight />
              </Button>

              <Separator orientation="vertical" className="mx-1 h-6" />

              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="縮小"
                onClick={() => void setZoomFactor(zoom - 0.1)}
              >
                <Minus />
              </Button>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-w-[52px] tabular-nums"
                      onClick={() => void setZoomFactor(1)}
                    >
                      {Math.round(zoom * 100)}%
                    </Button>
                  }
                />
                <TooltipContent side="top">100%に戻す</TooltipContent>
              </Tooltip>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="拡大"
                onClick={() => void setZoomFactor(zoom + 0.1)}
              >
                <Plus />
              </Button>

              <Separator orientation="vertical" className="mx-1 h-6" />

              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant={sidebarVisible ? "secondary" : "ghost"}
                      size="icon-sm"
                      aria-pressed={sidebarVisible}
                      aria-label="サイドバー"
                      onClick={() => setSidebarVisible((visible) => !visible)}
                    >
                      <PanelLeft />
                    </Button>
                  }
                />
                <TooltipContent side="top">サイドバー</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="集中モード"
                      onClick={() => setFocusMode((enabled) => !enabled)}
                    >
                      <Maximize2 />
                    </Button>
                  }
                />
                <TooltipContent side="top">集中モード</TooltipContent>
              </Tooltip>
            </div>
          </header>
        ) : null}

        {error ? (
          <div className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            <FileX className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
        {deck?.warning ? (
          <div className="flex items-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            <FileWarning className="size-4 shrink-0" />
            <span>{deck.warning}</span>
          </div>
        ) : null}

        <main className={cn("flex min-h-0 flex-1 gap-3", focusMode ? "p-0" : "p-3")}>
          {showSidebar ? (
            <aside className="flex w-72 shrink-0 flex-col overflow-hidden border bg-card">
              <div className="flex items-baseline justify-between gap-2 border-b px-4 py-3">
                <span className="truncate text-sm font-semibold">
                  {deck?.rootName ?? "仕様書未選択"}
                </span>
                {deck ? (
                  <Badge variant="secondary" className="shrink-0">
                    {deck.hasToc ? "目次" : "フォールバック"}
                  </Badge>
                ) : null}
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
                              onClick={() => void navigateTo(page)}
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
                                onClick={() => toggleExpanded(page.id)}
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
                                const anchorSelected =
                                  isSelected && selectedHash === anchor.hash;
                                return (
                                  <button
                                    key={anchor.id}
                                    type="button"
                                    onClick={() => void navigateTo(page, anchor.href)}
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
          ) : null}

          <section
            className={cn(
              "relative min-h-0 min-w-0 flex-1 overflow-hidden border bg-card",
              focusMode && "border-0"
            )}
          >
            {!deck ? (
              <div className="absolute inset-0 z-1 grid place-content-center gap-4 p-10 text-center">
                <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <FileText className="size-7" />
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl font-bold tracking-tight">HTML仕様書ビューワー</h1>
                  <p className="mx-auto max-w-md text-sm text-muted-foreground">
                    静的HTML仕様書フォルダを開くと、PPTのようにページ移動・検索できます。
                  </p>
                </div>
                <div className="flex justify-center">
                  <Button onClick={openFolder}>
                    <FolderOpen />
                    仕様書フォルダを開く
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
                      onClick={() => setFocusMode(false)}
                    >
                      <Minimize2 />
                    </Button>
                  }
                />
                <TooltipContent side="left">集中モードを解除 (Esc)</TooltipContent>
              </Tooltip>
            ) : null}
          </section>

          {showResults ? (
            <aside
              data-testid="results-pane"
              className="flex min-h-0 w-80 shrink-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm"
            >
              <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                <span className="text-sm font-semibold">検索結果</span>
                <Badge variant="secondary" data-testid="results-total">
                  {searchResult.totalHits} 件
                </Badge>
              </div>
              {searchResult.pages.length > 0 ? (
                <ScrollArea className="min-h-0 flex-1" data-testid="results-scroll">
                  <div className="flex flex-col gap-1 p-2">
                    {searchResult.pages.map((pageResult) => (
                      <section
                        key={pageResult.pageId}
                        data-testid="result-page"
                        className="flex flex-col gap-0.5"
                      >
                        <button
                          type="button"
                          onClick={() => navigateToSearchTarget(pageResult.pagePath, "first")}
                          className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-accent"
                        >
                          <strong className="truncate text-sm font-medium">
                            {pageResult.pageTitle}
                          </strong>
                          <Badge variant="outline" className="shrink-0">
                            {pageResult.count}
                          </Badge>
                        </button>
                        {pageResult.hits.slice(0, 5).map((hit) => (
                          <button
                            key={hit.id}
                            type="button"
                            onClick={() =>
                              navigateToSearchTarget(hit.pagePath, "first", hit.ordinal)
                            }
                            className="ml-2 rounded-md px-2.5 py-1.5 text-left text-xs leading-relaxed text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                          >
                            {hit.snippet}
                          </button>
                        ))}
                      </section>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
                  <X className="size-5" />
                  <span>一致するページはありません。</span>
                </div>
              )}
            </aside>
          ) : null}
        </main>
      </div>
    </TooltipProvider>
  );
}
