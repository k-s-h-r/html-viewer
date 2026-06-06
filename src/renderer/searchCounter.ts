import type { FindResult, SearchResult } from "../shared/types";

export function formatGlobalFindCounter(
  searchQuery: string,
  searchResult: SearchResult,
  selectedPath: string | null,
  findResult: FindResult | null
): string | null {
  if (!searchQuery.trim() || searchResult.totalHits === 0) {
    return null;
  }
  if (!findResult || findResult.matches === 0) {
    return null;
  }

  const pageIndex = searchResult.pages.findIndex((page) => page.pagePath === selectedPath);
  const hitsBefore =
    pageIndex >= 0
      ? searchResult.pages.slice(0, pageIndex).reduce((sum, page) => sum + page.count, 0)
      : 0;

  return `${hitsBefore + findResult.activeMatchOrdinal}/${searchResult.totalHits}`;
}
