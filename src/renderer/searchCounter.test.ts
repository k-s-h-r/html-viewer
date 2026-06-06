import { describe, expect, it } from "vitest";
import type { FindResult, SearchResult } from "../shared/types";
import { formatGlobalFindCounter } from "./searchCounter";

const searchResult: SearchResult = {
  query: "検索",
  matchCase: false,
  totalHits: 10,
  pages: [
    {
      pageId: "intro.html",
      pageTitle: "概要",
      pagePath: "intro.html",
      count: 3,
      hits: []
    },
    {
      pageId: "chapters/search.html",
      pageTitle: "検索",
      pagePath: "chapters/search.html",
      count: 7,
      hits: []
    }
  ]
};

const findResult: FindResult = {
  requestId: 1,
  activeMatchOrdinal: 2,
  matches: 3,
  finalUpdate: true
};

describe("formatGlobalFindCounter", () => {
  it("shows the global position and total hits instead of page-local counts", () => {
    expect(formatGlobalFindCounter("検索", searchResult, "intro.html", findResult)).toBe("2/10");
  });

  it("offsets the position for later pages in the result set", () => {
    expect(
      formatGlobalFindCounter("検索", searchResult, "chapters/search.html", {
        ...findResult,
        activeMatchOrdinal: 1,
        matches: 7
      })
    ).toBe("4/10");
  });

  it("returns null when there are no active matches", () => {
    expect(formatGlobalFindCounter("検索", searchResult, "intro.html", null)).toBeNull();
  });
});
