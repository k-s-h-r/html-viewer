import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildDeck, flattenDeckPages } from "./deck.js";

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
      "chapters/search.html",
      "missing.html",
      "../outside.html",
      "https://developer.mozilla.org/ja/"
    ]);

    expect(deck.pages[0]).toMatchObject({
      title: "概要",
      tocNum: "1",
      kind: "page",
      exists: true
    });

    expect(deck.pages[1]).toMatchObject({
      title: "セットアップ",
      tocNum: "2",
      kind: "page",
      exists: true
    });
    expect(deck.pages[1].children.map((child) => child.tocNum)).toEqual(["2-1", "2-2"]);
    expect(deck.pages[1].children[0]).toMatchObject({
      title: "フォルダ構成",
      href: "chapters/setup.html#folder"
    });
    expect(deck.pages[1].children[1]).toMatchObject({
      title: "ローカル配信",
      href: "chapters/setup.html#serving"
    });

    expect(deck.pages[2]).toMatchObject({
      title: "検索",
      tocNum: "3",
      href: "chapters/search.html",
      anchors: []
    });
    expect(deck.pages[3]).toMatchObject({
      title: "全ページカタログ",
      tocNum: "4",
      href: "chapters/search.html#catalog",
      anchors: []
    });

    expect(flattenDeckPages(deck.pages).filter((page) => page.kind === "page")).toHaveLength(6);
    expect(deck.pages[4]).toMatchObject({ kind: "missing", reason: "見つかりません" });
    expect(deck.pages[5]).toMatchObject({ kind: "out-of-scope", reason: "範囲外" });
    expect(deck.pages[6]).toMatchObject({ kind: "external", reason: "外部リンク" });
  });

  it("merges hash links without distinct toc numbers into one page", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "html-viewer-deck-"));
    await writeFile(
      path.join(rootDir, "index.html"),
      `<!doctype html><html><body>
        <a href="page.html#one"><span class="toc-name">One</span></a>
        <a href="page.html#two"><span class="toc-name">Two</span></a>
      </body></html>`
    );
    await writeFile(path.join(rootDir, "page.html"), "<!doctype html><title>Page</title>");

    const deck = await buildDeck(rootDir);

    expect(deck.pages).toHaveLength(1);
    expect(deck.pages[0].anchors).toEqual([
      expect.objectContaining({ hash: "#one", title: "One" }),
      expect.objectContaining({ hash: "#two", title: "Two" })
    ]);
  });

  it("nests dot-separated and multi-level toc numbers", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "html-viewer-deck-"));
    await writeFile(
      path.join(rootDir, "index.html"),
      `<!doctype html><html><body>
        <a href="a.html"><span class="toc-num">1</span><span class="toc-name">Chapter</span></a>
        <a href="a.html#sec1"><span class="toc-num">1.1</span><span class="toc-name">Section 1</span></a>
        <a href="a.html#sec2"><span class="toc-num">1.1.1</span><span class="toc-name">Subsection</span></a>
        <a href="b.html"><span class="toc-num">2</span><span class="toc-name">Other</span></a>
        <a href="b.html#x"><span class="toc-num">2.1</span><span class="toc-name">Other sub</span></a>
      </body></html>`
    );
    await writeFile(path.join(rootDir, "a.html"), "<!doctype html><title>A</title>");
    await writeFile(path.join(rootDir, "b.html"), "<!doctype html><title>B</title>");

    const deck = await buildDeck(rootDir);

    expect(deck.pages[0].tocNum).toBe("1");
    expect(deck.pages[0].children.map((child) => child.tocNum)).toEqual(["1.1"]);
    expect(deck.pages[0].children[0].children.map((child) => child.tocNum)).toEqual(["1.1.1"]);

    expect(deck.pages[1].tocNum).toBe("2");
    expect(deck.pages[1].children.map((child) => child.tocNum)).toEqual(["2.1"]);

    expect(flattenDeckPages(deck.pages).map((page) => page.tocNum)).toEqual([
      "1",
      "1.1",
      "1.1.1",
      "2",
      "2.1"
    ]);
  });

  it("prefers menu.json over index.html", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "html-viewer-deck-"));
    await writeFile(
      path.join(rootDir, "menu.json"),
      JSON.stringify({
        pages: [
          { href: "b.html", title: "From menu", num: "1" },
          { href: "a.html", title: "Also menu", num: "2" }
        ]
      })
    );
    await writeFile(
      path.join(rootDir, "index.html"),
      `<!doctype html><html><body>
        <a href="a.html"><span class="toc-name">From index</span></a>
      </body></html>`
    );
    await writeFile(path.join(rootDir, "a.html"), "<!doctype html><title>A</title>");
    await writeFile(path.join(rootDir, "b.html"), "<!doctype html><title>B</title>");

    const deck = await buildDeck(rootDir);

    expect(deck.hasToc).toBe(true);
    expect(deck.pages.map((page) => page.title)).toEqual(["From menu", "Also menu"]);
  });

  it("falls back to index.html when menu.json is missing or empty", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "html-viewer-deck-"));
    await writeFile(path.join(rootDir, "menu.json"), JSON.stringify({ pages: [] }));
    await writeFile(
      path.join(rootDir, "index.html"),
      `<!doctype html><html><body>
        <a href="page.html"><span class="toc-name">From index</span></a>
      </body></html>`
    );
    await writeFile(path.join(rootDir, "page.html"), "<!doctype html><title>Page</title>");

    const deck = await buildDeck(rootDir);

    expect(deck.pages).toHaveLength(1);
    expect(deck.pages[0].title).toBe("From index");
  });

  it("loads menu-config sample deck from menu.json", async () => {
    const deckPath = path.resolve(process.cwd(), "sample-decks/menu-config");
    const deck = await buildDeck(deckPath);

    expect(deck.hasToc).toBe(true);
    expect(deck.pages.map((page) => page.path)).toEqual([
      "chapters/search.html",
      "intro.html",
      "chapters/setup.html"
    ]);
    expect(deck.pages[0].title).toContain("menu.json 1番目");
    expect(deck.pages[2].children.map((child) => child.tocNum)).toEqual(["3-1", "3-2"]);
  });

  it("loads file-scan sample deck by recursive HTML scanning", async () => {
    const deckPath = path.resolve(process.cwd(), "sample-decks/file-scan");
    const deck = await buildDeck(deckPath);

    expect(deck.hasToc).toBe(false);
    expect(deck.warning).toContain("目次がありません");
    expect(deck.pages.map((page) => page.path)).toEqual([
      "01-intro.html",
      "02-setup.html",
      "chapters/03-search.html"
    ]);
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
