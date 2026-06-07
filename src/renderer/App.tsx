import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Deck,
  DeckPage,
  FindResult,
  NavigationState,
  RecentFolder,
  SearchResult
} from "../shared/types";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { formatGlobalFindCounter } from "./searchCounter";
import {
  clampZoom,
  firstNavigablePagePath,
  flattenDeckPages,
  canNavigate,
  pageMatchesSelection,
  visibleNavigablePages
} from "./pageUtils";
import { Toolbar } from "./components/Toolbar";
import { TocSidebar } from "./components/TocSidebar";
import { ViewerSection } from "./components/ViewerSection";
import { ResultsPane } from "./components/ResultsPane";
import { StatusBanners } from "./components/StatusBanners";
import { readSidebarLayout, resetSidebarLayout, saveSidebarLayout, toPanelLayout } from "./sidebarLayout";

const EMPTY_SEARCH: SearchResult = {
  query: "",
  matchCase: false,
  totalHits: 0,
  pages: []
};

export default function App() {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [recentFolders, setRecentFolders] = useState<RecentFolder[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [resultsPaneVisible, setResultsPaneVisible] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResult>(EMPTY_SEARCH);
  const [findResult, setFindResult] = useState<FindResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());
  const [sidebarLayoutVersion, setSidebarLayoutVersion] = useState(0);
  const viewerHostRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const findSequenceRef = useRef(0);

  const navigablePages = useMemo(
    () => visibleNavigablePages(deck?.pages ?? [], expandedPages),
    [deck, expandedPages]
  );

  const selectedPageNumber = useMemo(() => {
    const index = navigablePages.findIndex((page) =>
      pageMatchesSelection(page, selectedPath, selectedHash)
    );
    return index >= 0 ? index + 1 : 0;
  }, [navigablePages, selectedPath, selectedHash]);

  const applyDeck = useCallback((nextDeck: Deck | null) => {
    setDeck(nextDeck);
    setSearchResult(EMPTY_SEARCH);
    setFindResult(null);
    setSearchQuery("");
    setSubmittedQuery("");
    setSelectedPath(firstNavigablePagePath(nextDeck));
    setSelectedHash(null);
    setExpandedPages(new Set());
  }, []);

  const updateRecentFolders = useCallback(async () => {
    setRecentFolders(await window.viewerApi.getRecentFolders());
  }, []);

  const focusSearchInput = useCallback(() => {
    const input = searchInputRef.current;
    if (!input) {
      return;
    }
    input.focus({ preventScroll: true });
    input.select();
  }, []);

  const getSearchInputPoint = useCallback(() => {
    const input = searchInputRef.current;
    if (!input) {
      return undefined;
    }
    const rect = input.getBoundingClientRect();
    return {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2)
    };
  }, []);

  const ensureSearchInputFocused = useCallback(async () => {
    await window.viewerApi.focusSearch(getSearchInputPoint());
  }, [getSearchInputPoint]);

  const beginFind = useCallback(
    (query = submittedQuery, forward = true) => {
      if (!query.trim()) {
        return;
      }
      const sequence = (findSequenceRef.current += 1);
      void (async () => {
        await window.viewerApi.stopFindInPage();
        if (findSequenceRef.current !== sequence) {
          return;
        }
        await window.viewerApi.findInPage({
          query,
          forward,
          findNext: true,
          matchCase
        });
        window.setTimeout(() => {
          if (findSequenceRef.current !== sequence) {
            return;
          }
          void window.viewerApi.findInPage({
            query,
            forward,
            findNext: false,
            matchCase
          });
        }, 0);
      })();
    },
    [matchCase, submittedQuery]
  );

  const stepFind = useCallback(
    (forward: boolean) => {
      if (!submittedQuery.trim()) {
        return;
      }
      findSequenceRef.current += 1;
      void window.viewerApi.findInPage({
        query: submittedQuery,
        forward,
        findNext: false,
        matchCase
      });
    },
    [matchCase, submittedQuery]
  );

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

  const navigateTo = useCallback(
    async (
      page: DeckPage,
      href = page.href,
      openExternal = false,
      refindForward?: boolean
    ) => {
      if (!canNavigate(page)) {
        return;
      }

      if (page.kind === "external") {
        if (openExternal) {
          await window.viewerApi.openExternal(page.href);
        }
        return;
      }

      await window.viewerApi.navigate(href);
      if (refindForward !== undefined && submittedQuery.trim()) {
        beginFind(submittedQuery, refindForward);
      }
    },
    [beginFind, submittedQuery]
  );

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

      const currentIndex = navigablePages.findIndex((page) =>
        pageMatchesSelection(page, selectedPath, selectedHash)
      );
      const nextIndex = Math.min(
        navigablePages.length - 1,
        Math.max(0, currentIndex + offset)
      );
      const page = navigablePages[nextIndex] ?? navigablePages[0];
      void navigateTo(
        page,
        page.href,
        false,
        submittedQuery.trim() ? true : undefined
      );
    },
    [deck, navigablePages, navigateTo, selectedPath, selectedHash, submittedQuery]
  );

  const clearSearch = useCallback(async () => {
    findSequenceRef.current += 1;
    setSearchQuery("");
    setSubmittedQuery("");
    setSearchResult(EMPTY_SEARCH);
    setFindResult(null);
    await window.viewerApi.stopFindInPage();
    searchInputRef.current?.focus();
  }, []);

  const executeSearch = useCallback(async () => {
    const query = searchQuery.trim();
    if (!query) {
      await clearSearch();
      return;
    }

    const result = await window.viewerApi.search(query, matchCase);
    setSubmittedQuery(query);
    setSearchResult(result);
    setFindResult(null);
    setResultsPaneVisible(true);
    await ensureSearchInputFocused();
    beginFind(query, true);
  }, [beginFind, clearSearch, ensureSearchInputFocused, matchCase, searchQuery]);

  const navigateToSearchTarget = useCallback(
    async (pagePath: string, forward = true) => {
      const page = deck
        ? flattenDeckPages(deck.pages).find(
            (candidate) => candidate.kind === "page" && candidate.path === pagePath
          )
        : undefined;
      if (!page) {
        return;
      }

      if (pagePath === selectedPath) {
        beginFind(submittedQuery, forward);
        await ensureSearchInputFocused();
      } else {
        await navigateTo(page, page.href, false, forward);
        await ensureSearchInputFocused();
      }
    },
    [beginFind, deck, ensureSearchInputFocused, navigateTo, selectedPath, submittedQuery]
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
        void navigateToSearchTarget(target.pagePath, forward);
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
        void navigateToSearchTarget(target.pagePath, forward);
        return;
      }

      stepFind(forward);
    },
    [findResult, navigateToSearchTarget, searchResult.pages, selectedPath, stepFind, submittedQuery]
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
    const cleanupFocusSearch = window.viewerApi.onFocusSearch(focusSearchInput);
    const cleanupSidebarLayoutReset = window.viewerApi.onSidebarLayoutReset(() => {
      resetSidebarLayout();
      setSidebarLayoutVersion((version) => version + 1);
    });

    return () => {
      cleanupDeck();
      cleanupNavigation();
      cleanupFind();
      cleanupZoom();
      cleanupFocusSearch();
      cleanupSidebarLayoutReset();
    };
  }, [applyDeck, focusSearchInput, updateRecentFolders]);

  useEffect(() => {
    return window.viewerApi.onDocumentEscape(() => {
      if (focusMode) {
        setFocusMode(false);
        return;
      }
      if (sidebarVisible) {
        void window.viewerApi.focusSidebar();
      }
    });
  }, [focusMode, sidebarVisible]);

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
  }, [reportViewBounds, sidebarVisible, resultsPaneVisible, focusMode, submittedQuery]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && focusMode) {
        setFocusMode(false);
      }

      if (event.ctrlKey || event.metaKey) {
        if (event.key.toLowerCase() === "f") {
          event.preventDefault();
          void ensureSearchInputFocused();
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

      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        navigateByOffset(1);
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        navigateByOffset(-1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [ensureSearchInputFocused, focusMode, navigateByOffset, setZoomFactor, zoom]);

  const openFolder = async () => {
    try {
      setError(null);
      const nextDeck = await window.viewerApi.openFolder();
      if (nextDeck) {
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
        await updateRecentFolders();
      }
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : String(openError));
    }
  };

  const openEditor = async () => {
    if (!selectedPath) {
      return;
    }
    try {
      setError(null);
      await window.viewerApi.openEditor(selectedPath);
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
  const showResultsPane = showResults && resultsPaneVisible && !focusMode;
  const sidebarDefaultLayout = useMemo(
    () => (showSidebar ? toPanelLayout(readSidebarLayout()) : null),
    [showSidebar, sidebarLayoutVersion]
  );
  const handleSidebarLayoutChanged = useCallback((layout: Record<string, number>) => {
    if (typeof layout.sidebar !== "number") {
      return;
    }
    saveSidebarLayout({ sidebar: layout.sidebar });
  }, []);
  const findCounter = useMemo(
    () => formatGlobalFindCounter(submittedQuery, searchResult, selectedPath, findResult),
    [findResult, searchResult, selectedPath, submittedQuery]
  );

  const refindForward = submittedQuery.trim() ? true : undefined;

  return (
    <TooltipProvider delay={300}>
      <div
        data-testid="app-shell"
        data-focus-mode={focusMode}
        className="flex h-full w-full min-w-[960px] flex-col overflow-hidden bg-muted/40 text-foreground"
      >
        {!focusMode ? (
          <Toolbar
            deck={deck}
            recentFolders={recentFolders}
            searchInputRef={searchInputRef}
            searchQuery={searchQuery}
            matchCase={matchCase}
            findCounter={findCounter}
            showResults={showResults}
            selectedPageNumber={selectedPageNumber}
            navigablePageCount={navigablePages.length}
            zoom={zoom}
            sidebarVisible={sidebarVisible}
            resultsPaneVisible={resultsPaneVisible}
            onOpenFolder={() => void openFolder()}
            onOpenRecentFolder={(folderPath) => void openRecentFolder(folderPath)}
            onOpenEditor={() => void openEditor()}
            onSearchQueryChange={setSearchQuery}
            onClearSearch={() => void clearSearch()}
            onMatchCaseToggle={() => setMatchCase((value) => !value)}
            onExecuteSearch={() => void executeSearch()}
            onNavigateSearchAcrossPages={navigateSearchAcrossPages}
            onNavigateByOffset={navigateByOffset}
            onSetZoomFactor={setZoomFactor}
            onSidebarVisibleToggle={() => setSidebarVisible((visible) => !visible)}
            onResultsPaneVisibleToggle={() => setResultsPaneVisible((visible) => !visible)}
            onFocusModeEnable={() => setFocusMode(true)}
          />
        ) : null}

        <StatusBanners error={error} warning={deck?.warning} />

        <main className={cn("flex min-h-0 flex-1 gap-3", focusMode ? "p-0" : "p-3 pt-4")}>
          {showSidebar && sidebarDefaultLayout ? (
            <ResizablePanelGroup
              key={`sidebar-layout-${sidebarLayoutVersion}`}
              data-testid="main-panel-group"
              orientation="horizontal"
              className="min-h-0 min-w-0 flex-1"
              defaultLayout={sidebarDefaultLayout}
              onLayoutChanged={handleSidebarLayoutChanged}
            >
              <ResizablePanel
                id="sidebar"
                minSize="15%"
                maxSize="45%"
                className="min-w-0"
              >
                <TocSidebar
                  deck={deck}
                  selectedPath={selectedPath}
                  selectedHash={selectedHash}
                  expandedPages={expandedPages}
                  onToggleExpanded={toggleExpanded}
                  onNavigateTo={(page, href, openExternal) =>
                    navigateTo(page, href ?? page.href, openExternal, refindForward)
                  }
                  onNavigateByOffset={navigateByOffset}
                  onClose={() => setSidebarVisible(false)}
                />
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel id="viewer" minSize="40%" className="min-w-0">
                <ViewerSection
                  deck={deck}
                  focusMode={focusMode}
                  viewerHostRef={viewerHostRef}
                  onOpenFolder={() => void openFolder()}
                  onFocusModeDisable={() => setFocusMode(false)}
                />
              </ResizablePanel>
            </ResizablePanelGroup>
          ) : (
            <div className="min-h-0 min-w-0 flex-1">
              <ViewerSection
                deck={deck}
                focusMode={focusMode}
                viewerHostRef={viewerHostRef}
                onOpenFolder={() => void openFolder()}
                onFocusModeDisable={() => setFocusMode(false)}
              />
            </div>
          )}

          {showResultsPane ? (
            <ResultsPane
              searchResult={searchResult}
              submittedQuery={submittedQuery}
              matchCase={matchCase}
              onNavigateToSearchTarget={(pagePath) =>
                void navigateToSearchTarget(pagePath, true)
              }
              onClose={() => setResultsPaneVisible(false)}
            />
          ) : null}
        </main>
      </div>
    </TooltipProvider>
  );
}
