import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildDeck } from "./deck.js";

const sampleDeckPath = path.resolve(process.cwd(), "sample-decks/basic");

describe("buildDeck", () => {
  it("parses index.html as the TOC and classifies links", async () => {
    const deck = await buildDeck(sampleDeckPath);

    expect(deck.hasToc).toBe(true);
    expect(deck.warning).toBeUndefined();
    expect(deck.pages.map((page) => page.path)).toEqual([
      "intro.html",
      "chapters/setup.html",
      "chapters/search.html",
      "missing.html",
      "../outside.html",
      "https://developer.mozilla.org/ja/"
    ]);

    expect(deck.pages[0]).toMatchObject({
      title: "概要",
      kind: "page",
      exists: true
    });
    expect(deck.pages[2].anchors).toEqual([
      {
        id: "chapters/search.html#catalog",
        title: "検索: 全ページカタログ",
        href: "chapters/search.html#catalog",
        hash: "#catalog"
      },
      {
        id: "chapters/search.html#in-page",
        title: "検索: ページ内検索",
        href: "chapters/search.html#in-page",
        hash: "#in-page"
      }
    ]);
    expect(deck.pages[3]).toMatchObject({ kind: "missing", reason: "見つかりません" });
    expect(deck.pages[4]).toMatchObject({ kind: "out-of-scope", reason: "範囲外" });
    expect(deck.pages[5]).toMatchObject({ kind: "external", reason: "外部リンク" });
  });

  it("falls back to recursive HTML scanning when index.html is missing", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "html-viewer-deck-"));
    await mkdir(path.join(rootDir, "chapter"), { recursive: true });
    await writeFile(
      path.join(rootDir, "b.html"),
      "<!doctype html><title>B title</title><h1>B heading</h1>"
    );
    await writeFile(
      path.join(rootDir, "chapter", "a.html"),
      "<!doctype html><h1>A heading</h1>"
    );

    const deck = await buildDeck(rootDir);

    expect(deck.hasToc).toBe(false);
    expect(deck.warning).toContain("目次がありません");
    expect(deck.pages.map((page) => page.path)).toEqual(["b.html", "chapter/a.html"]);
    expect(deck.pages.map((page) => page.title)).toEqual(["B title", "A heading"]);
  });
});
