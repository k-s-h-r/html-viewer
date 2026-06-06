import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildDeck } from "./deck.js";
import { SearchCatalog } from "./search.js";

const sampleDeckPath = path.resolve(process.cwd(), "sample-decks/basic");

describe("SearchCatalog", () => {
  it("returns page grouped hits for deck pages only", async () => {
    const deck = await buildDeck(sampleDeckPath);
    const catalog = await SearchCatalog.create(sampleDeckPath, deck);

    const result = catalog.query("検索", false);

    expect(result.totalHits).toBeGreaterThanOrEqual(4);
    expect(result.pages.map((page) => page.pagePath)).toContain("intro.html");
    expect(result.pages.map((page) => page.pagePath)).toContain("chapters/search.html");
    expect(result.pages.map((page) => page.pagePath)).not.toContain("missing.html");
    expect(result.pages[0].hits[0].snippet).toContain("検索");
    expect(result.pages[0].hits[0].snippet.length).toBeLessThanOrEqual(44);
    expect(result.pages[0].hits[0].ordinal).toBe(1);
    if (result.pages[0].hits.length > 1) {
      expect(result.pages[0].hits[1].ordinal).toBe(2);
    }
  });

  it("respects matchCase", async () => {
    const deck = await buildDeck(sampleDeckPath);
    const catalog = await SearchCatalog.create(sampleDeckPath, deck);

    expect(catalog.query("Chromium", true).totalHits).toBeGreaterThan(0);
    expect(catalog.query("chromium", true).totalHits).toBe(0);
    expect(catalog.query("chromium", false).totalHits).toBeGreaterThan(0);
  });
});
