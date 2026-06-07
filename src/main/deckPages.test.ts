import { cp, mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildDeck } from "./deck.js";
import { addPage, deletePage, duplicatePage } from "./deckPages.js";
import { readTocEntries } from "./deckToc.js";

const menuConfigDeck = path.resolve(process.cwd(), "sample-decks/menu-config");

describe("deckPages", () => {
  it("adds a page and updates menu.json", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "html-viewer-pages-"));
    await cp(menuConfigDeck, rootDir, { recursive: true });

    const result = await addPage(rootDir, {
      title: "テストページ",
      relativePath: "test-page.html",
      insertAfter: "intro.html"
    });

    expect(result.path).toBe("test-page.html");
    const toc = await readTocEntries(rootDir);
    expect(toc.entries.map((entry) => entry.href)).toContain("test-page.html");
    expect(
      toc.entries.find((entry) => entry.href === "test-page.html")?.title
    ).toBe("テストページ");

    const html = await readFile(path.join(rootDir, "test-page.html"), "utf8");
    expect(html).toContain("テストページ");
  });

  it("duplicates a page after the source", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "html-viewer-pages-"));
    await cp(menuConfigDeck, rootDir, { recursive: true });

    const result = await duplicatePage(rootDir, {
      sourcePath: "intro.html",
      relativePath: "intro-copy.html"
    });

    expect(result.path).toBe("intro-copy.html");
    const toc = await readTocEntries(rootDir);
    const introIndex = toc.entries.findIndex((entry) => entry.href === "intro.html");
    expect(toc.entries[introIndex + 1]).toMatchObject({
      href: "intro-copy.html",
      title: expect.stringContaining("コピー")
    });

    const html = await readFile(path.join(rootDir, "intro-copy.html"), "utf8");
    expect(html).toContain("コピー");
  });

  it("deletes a page and removes related toc entries", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "html-viewer-pages-"));
    await cp(menuConfigDeck, rootDir, { recursive: true });

    await addPage(rootDir, {
      title: "削除対象",
      relativePath: "delete-me.html"
    });

    await deletePage(rootDir, { targetPath: "delete-me.html" });

    const toc = await readTocEntries(rootDir);
    expect(toc.entries.some((entry) => entry.href === "delete-me.html")).toBe(false);

    await expect(readFile(path.join(rootDir, "delete-me.html"), "utf8")).rejects.toThrow();
  });

  it("removes anchor toc entries when deleting the parent page", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "html-viewer-pages-"));
    await cp(menuConfigDeck, rootDir, { recursive: true });

    const before = await readTocEntries(rootDir);
    expect(before.entries.some((entry) => entry.href === "chapters/setup.html#folder")).toBe(
      true
    );

    await deletePage(rootDir, { targetPath: "chapters/setup.html" });

    const after = await readTocEntries(rootDir);
    expect(after.entries.some((entry) => entry.href.startsWith("chapters/setup.html"))).toBe(
      false
    );
  });

  it("buildDeck reflects added pages", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "html-viewer-pages-"));
    await cp(menuConfigDeck, rootDir, { recursive: true });

    await addPage(rootDir, {
      title: "ビルド確認",
      relativePath: "build-check.html"
    });

    const deck = await buildDeck(rootDir);
    expect(deck.pages.some((page) => page.path === "build-check.html")).toBe(true);
  });
});
