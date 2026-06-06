import { readFile } from "node:fs/promises";
import { load } from "cheerio";
import type { Deck, PageSearchResult, SearchHit, SearchResult } from "../shared/types.js";
import { localPathFromPage } from "./deck.js";

interface IndexedPage {
  id: string;
  title: string;
  path: string;
  text: string;
}

function htmlToText(html: string): string {
  const $ = load(html);
  $("script,style,noscript").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}

function makeSnippet(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 48);
  const end = Math.min(text.length, index + length + 72);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

function findHits(page: IndexedPage, query: string, matchCase: boolean): SearchHit[] {
  if (!query.trim()) {
    return [];
  }

  const haystack = matchCase ? page.text : page.text.toLocaleLowerCase();
  const needle = matchCase ? query : query.toLocaleLowerCase();
  const hits: SearchHit[] = [];
  let index = haystack.indexOf(needle);

  while (index >= 0) {
    hits.push({
      id: `${page.id}:${index}`,
      pageId: page.id,
      pageTitle: page.title,
      pagePath: page.path,
      index,
      ordinal: hits.length + 1,
      snippet: makeSnippet(page.text, index, query.length)
    });
    index = haystack.indexOf(needle, index + Math.max(needle.length, 1));
  }

  return hits;
}

export class SearchCatalog {
  private readonly pages: IndexedPage[];

  private constructor(pages: IndexedPage[]) {
    this.pages = pages;
  }

  static async create(rootDir: string, deck: Deck): Promise<SearchCatalog> {
    const pages: IndexedPage[] = [];

    for (const page of deck.pages) {
      const localPath = localPathFromPage(rootDir, page);
      if (!localPath) {
        continue;
      }

      const html = await readFile(localPath, "utf8");
      pages.push({
        id: page.id,
        title: page.title,
        path: page.path,
        text: htmlToText(html)
      });
    }

    return new SearchCatalog(pages);
  }

  query(query: string, matchCase: boolean): SearchResult {
    const pageResults: PageSearchResult[] = [];
    let totalHits = 0;

    for (const page of this.pages) {
      const hits = findHits(page, query, matchCase);
      if (hits.length === 0) {
        continue;
      }

      totalHits += hits.length;
      pageResults.push({
        pageId: page.id,
        pageTitle: page.title,
        pagePath: page.path,
        count: hits.length,
        hits
      });
    }

    return {
      query,
      matchCase,
      totalHits,
      pages: pageResults
    };
  }
}
