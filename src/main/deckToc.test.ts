import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  detectTocSource,
  readMenuJsonText,
  readTocEntries,
  writeMenuJsonText,
  writeTocEntries
} from "./deckToc.js";

const menuConfigDeck = path.resolve(process.cwd(), "sample-decks/menu-config");
const basicDeck = path.resolve(process.cwd(), "sample-decks/basic");

describe("deckToc", () => {
  it("detects menu.json source", async () => {
    expect(await detectTocSource(menuConfigDeck)).toEqual({ kind: "menu-json" });
  });

  it("detects index.html source", async () => {
    expect(await detectTocSource(basicDeck)).toEqual({ kind: "index-html" });
  });

  it("reads menu.json entries", async () => {
    const snapshot = await readTocEntries(menuConfigDeck);
    expect(snapshot.source).toEqual({ kind: "menu-json" });
    expect(snapshot.entries.map((entry) => entry.href)).toEqual([
      "chapters/search.html",
      "intro.html",
      "chapters/setup.html",
      "chapters/setup.html#folder",
      "chapters/setup.html#serving"
    ]);
    expect(snapshot.entries[0].title).toContain("検索");
    expect(snapshot.entries[3].num).toBe("3-1");
  });

  it("reads index.html entries", async () => {
    const snapshot = await readTocEntries(basicDeck);
    expect(snapshot.source).toEqual({ kind: "index-html" });
    expect(snapshot.entries[0]).toMatchObject({
      href: "intro.html",
      title: "概要",
      num: "1"
    });
    expect(snapshot.entries.some((entry) => entry.href === "chapters/setup.html#folder")).toBe(
      true
    );
  });

  it("round-trips menu.json writes", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "html-viewer-toc-"));
    await cp(menuConfigDeck, rootDir, { recursive: true });

    const snapshot = await readTocEntries(rootDir);
    const appended = [
      ...snapshot.entries,
      { href: "new-page.html", title: "新規ページ", num: "9" }
    ];
    await writeTocEntries(rootDir, snapshot.source, appended);

    const reread = await readTocEntries(rootDir);
    expect(reread.entries).toEqual(appended);
    expect(JSON.parse(await readFile(path.join(rootDir, "menu.json"), "utf8"))).toMatchObject({
      pages: expect.arrayContaining([
        expect.objectContaining({ href: "new-page.html", title: "新規ページ", num: "9" })
      ])
    });
  });

  it("promotes fallback source to menu.json on write", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "html-viewer-toc-"));
    await writeFile(path.join(rootDir, "alpha.html"), "<!doctype html><title>Alpha</title>");
    await writeFile(path.join(rootDir, "beta.html"), "<!doctype html><title>Beta</title>");

    const snapshot = await readTocEntries(rootDir);
    expect(snapshot.source).toEqual({ kind: "fallback" });

    const entries = [
      { href: "alpha.html", title: "Alpha" },
      { href: "gamma.html", title: "Gamma" }
    ];
    await writeTocEntries(rootDir, snapshot.source, entries);

    const reread = await readTocEntries(rootDir);
    expect(reread.source).toEqual({ kind: "menu-json" });
    expect(reread.entries).toEqual(entries);
  });

  it("reads and writes menu.json text", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "html-viewer-toc-"));
    await cp(menuConfigDeck, rootDir, { recursive: true });

    const original = await readMenuJsonText(rootDir);
    expect(original).toContain('"pages"');

    const modified = original.replace(
      '"概要（menu.json 2番目）"',
      '"概要（menu.json 2番目・更新）"'
    );
    await writeMenuJsonText(rootDir, modified);

    const reread = await readMenuJsonText(rootDir);
    expect(reread).toContain("概要（menu.json 2番目・更新）");
  });

  it("round-trips index.html writes", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "html-viewer-toc-"));
    await cp(basicDeck, rootDir, { recursive: true });

    const snapshot = await readTocEntries(rootDir);
    const reordered = [...snapshot.entries.slice(1, 3), snapshot.entries[0], ...snapshot.entries.slice(3)];
    await writeTocEntries(rootDir, snapshot.source, reordered);

    const reread = await readTocEntries(rootDir);
    expect(reread.entries.map((entry) => entry.href)).toEqual(
      reordered.map((entry) => entry.href)
    );
    expect(reread.entries[2]).toMatchObject({
      href: "intro.html",
      title: "概要",
      num: "1"
    });
  });
});
