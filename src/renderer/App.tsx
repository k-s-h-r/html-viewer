import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Deck,
  DeckPage,
  FindResult,
  NavigationState,
  RecentFolder,
  SearchResult
} from "../shared/types";

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
      if (!searchQuery.trim()) {
        return;
      }
      void window.viewerApi.findInPage({
        query: searchQuery,
        forward,
        findNext,
        matchCase
      });
    },
    [matchCase, searchQuery]
  );

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
      if (!searchQuery.trim() || searchResult.pages.length === 0) {
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
    [findResult, navigateToSearchTarget, runFind, searchQuery, searchResult.pages, selectedPath]
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

    return () => {
      cleanupDeck();
      cleanupNavigation();
      cleanupFind();
      cleanupZoom();
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
  }, [reportViewBounds, sidebarVisible, focusMode, searchQuery]);

  useEffect(() => {
    const handle = window.setTimeout(async () => {
      if (!searchQuery.trim()) {
        setSearchResult(EMPTY_SEARCH);
        setFindResult(null);
        await window.viewerApi.stopFindInPage();
        return;
      }

      const result = await window.viewerApi.search(searchQuery, matchCase);
      setSearchResult(result);
      runFind(true, false);
    }, 150);

    return () => window.clearTimeout(handle);
  }, [matchCase, runFind, searchQuery]);

  useEffect(() => {
    if (selectedPath && searchQuery.trim()) {
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
  }, [runFind, runFindAtOrdinal, searchQuery, selectedPath]);

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

  return (
    <div className={`app-shell ${focusMode ? "is-focus-mode" : ""}`}>
      <header className="toolbar">
        <div className="toolbar-group">
          <button className="button primary" onClick={openFolder}>
            フォルダを開く
          </button>
          <select
            className="select"
            aria-label="最近使ったフォルダ"
            defaultValue=""
            onChange={(event) => {
              const folderPath = event.currentTarget.value;
              event.currentTarget.value = "";
              if (folderPath) {
                void openRecentFolder(folderPath);
              }
            }}
          >
            <option value="">最近使ったフォルダ</option>
            {recentFolders.map((folder) => (
              <option key={folder.path} value={folder.path}>
                {folder.name}
              </option>
            ))}
          </select>
        </div>

        <div className="toolbar-group search-group">
          <input
            ref={searchInputRef}
            className="search-input"
            placeholder="検索..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                navigateSearchAcrossPages(!event.shiftKey);
              }
            }}
          />
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={matchCase}
              onChange={(event) => setMatchCase(event.currentTarget.checked)}
            />
            大文字小文字
          </label>
          <button className="button" onClick={() => navigateSearchAcrossPages(false)}>
            前へ
          </button>
          <button className="button" onClick={() => navigateSearchAcrossPages(true)}>
            次へ
          </button>
        </div>

        <div className="toolbar-group">
          <button className="button" onClick={() => navigateByOffset(-1)}>
            ←
          </button>
          <span className="page-counter">
            {selectedPageNumber || "-"} / {navigablePages.length || "-"}
          </span>
          <button className="button" onClick={() => navigateByOffset(1)}>
            →
          </button>
          <button className="button" onClick={() => void setZoomFactor(zoom - 0.1)}>
            −
          </button>
          <button className="button" onClick={() => void setZoomFactor(1)}>
            {Math.round(zoom * 100)}%
          </button>
          <button className="button" onClick={() => void setZoomFactor(zoom + 0.1)}>
            ＋
          </button>
          <button className="button" onClick={() => setSidebarVisible((visible) => !visible)}>
            サイドバー
          </button>
          <button className="button" onClick={() => setFocusMode((enabled) => !enabled)}>
            集中
          </button>
        </div>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}
      {deck?.warning ? <div className="warning-banner">{deck.warning}</div> : null}

      <main className={`workspace ${!sidebarVisible || focusMode ? "sidebar-hidden" : ""}`}>
        {sidebarVisible && !focusMode ? (
          <aside className="sidebar">
            <div className="pane-title">
              <span>{deck?.rootName ?? "仕様書未選択"}</span>
              {deck ? <small>{deck.hasToc ? "index.html 目次" : "フォールバック"}</small> : null}
            </div>
            <div className="page-list">
              {deck ? (
                deck.pages.map((page, index) => {
                  const isSelected = page.path === selectedPath;
                  const isExpanded = expandedPages.has(page.id);
                  return (
                    <div
                      key={page.id}
                      className={`page-row ${isSelected ? "is-selected" : ""} ${
                        !canNavigate(page) ? "is-disabled" : ""
                      }`}
                    >
                      <button
                        className="page-main"
                        disabled={!canNavigate(page)}
                        onClick={() => void navigateTo(page)}
                      >
                        <span className="page-number">{index + 1}</span>
                        <span className="page-text">
                          <strong>{page.title}</strong>
                          <small>{statusLabel(page)}</small>
                        </span>
                      </button>
                      {page.anchors.length > 0 ? (
                        <button
                          className="anchor-toggle"
                          aria-label="アンカーを表示"
                          onClick={() => toggleExpanded(page.id)}
                        >
                          {isExpanded ? "▾" : "▸"}
                        </button>
                      ) : null}
                      {isExpanded ? (
                        <div className="anchor-list">
                          {page.anchors.map((anchor) => (
                            <button
                              key={anchor.id}
                              className={`anchor-row ${
                                isSelected && selectedHash === anchor.hash ? "is-selected" : ""
                              }`}
                              onClick={() => void navigateTo(page, anchor.href)}
                            >
                              {anchor.title}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <p className="empty-state">
                  フォルダを開くと、目次からページ一覧を生成します。
                </p>
              )}
            </div>
          </aside>
        ) : null}

        <section className="viewer-shell">
          {!deck ? (
            <div className="welcome">
              <h1>HTML仕様書ビューワー</h1>
              <p>静的HTML仕様書フォルダを開くと、PPTのようにページ移動・検索できます。</p>
              <button className="button primary" onClick={openFolder}>
                仕様書フォルダを開く
              </button>
            </div>
          ) : null}
          <div ref={viewerHostRef} className="browser-view-host" />
        </section>

        {searchQuery.trim() ? (
          <aside className="results-pane">
            <div className="pane-title">
              <span>検索結果</span>
              <small>{searchResult.totalHits} 件</small>
            </div>
            {searchResult.pages.length > 0 ? (
              <div className="result-list">
                {searchResult.pages.map((pageResult) => (
                  <section key={pageResult.pageId} className="result-page">
                    <button
                      className="result-page-title"
                      onClick={() => {
                        navigateToSearchTarget(pageResult.pagePath, "first");
                      }}
                    >
                      <strong>{pageResult.pageTitle}</strong>
                      <span>{pageResult.count} 件</span>
                    </button>
                    {pageResult.hits.slice(0, 5).map((hit) => (
                      <button
                        key={hit.id}
                        className="result-hit"
                        onClick={() => {
                          navigateToSearchTarget(hit.pagePath, "first", hit.ordinal);
                        }}
                      >
                        {hit.snippet}
                      </button>
                    ))}
                  </section>
                ))}
              </div>
            ) : (
              <p className="empty-state">一致するページはありません。</p>
            )}
          </aside>
        ) : null}
      </main>
    </div>
  );
}
