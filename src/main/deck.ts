import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { load } from "cheerio";
import type { Deck, DeckAnchor, DeckPage } from "../shared/types.js";
import { flattenDeckPages, splitHref } from "../shared/deckUtils.js";

export { flattenDeckPages, splitHref };

interface TocLink {
  href: string;
  text: string;
  tocNum: string | null;
}

interface MenuConfigPage {
  href: string;
  title?: string;
  num?: string;
}

interface MenuConfig {
  pages: MenuConfigPage[];
}

const MENU_CONFIG_FILENAME = "menu.json";

function toPosix(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

function isInsideRoot(rootDir: string, targetPath: string): boolean {
  const relative = path.relative(rootDir, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const fileStat = await stat(filePath);
    return fileStat.isFile();
  } catch {
    return false;
  }
}

function isHtmlPath(pathPart: string): boolean {
  return /\.html?$/i.test(pathPart);
}

function makeAnchor(pagePath: string, hash: string, title: string): DeckAnchor {
  return {
    id: `${pagePath}${hash}`,
    title: title || hash.replace(/^#/, "") || "アンカー",
    href: `${pagePath}${hash}`,
    hash
  };
}

async function readHtml(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

async function inferPageTitle(filePath: string): Promise<string> {
  try {
    const html = await readHtml(filePath);
    const $ = load(html);
    const title =
      $("title").first().text().trim() ||
      $("h1,h2,h3").first().text().trim() ||
      path.basename(filePath, path.extname(filePath));
    return title;
  } catch {
    return path.basename(filePath, path.extname(filePath));
  }
}

function parseTocNum(raw: string): string | null {
  const value = raw.trim();
  if (!value || value === "—" || value === "↗") {
    return null;
  }
  return value;
}

function extractTocLinks(indexHtml: string): TocLink[] {
  const $ = load(indexHtml);
  return $("a[href]")
    .toArray()
    .map((element) => {
      const $element = $(element);
      const tocNum = parseTocNum($element.find(".toc-num").first().text());
      const title =
        $element.find(".toc-name").first().text().trim() ||
        $element.text().replace(/\s+/g, " ").trim();
      return {
        href: String($element.attr("href") ?? "").trim(),
        text: title,
        tocNum
      };
    })
    .filter((link) => link.href.length > 0);
}

function parseMenuConfig(content: string): TocLink[] {
  const config = JSON.parse(content) as MenuConfig;
  if (!Array.isArray(config.pages)) {
    return [];
  }

  return config.pages
    .filter((page): page is MenuConfigPage => typeof page?.href === "string" && page.href.trim().length > 0)
    .map((page) => ({
      href: page.href.trim(),
      text: page.title?.trim() ?? "",
      tocNum: page.num?.trim() ? page.num.trim() : null
    }));
}

async function loadMenuConfigLinks(rootDir: string): Promise<TocLink[] | null> {
  const menuPath = path.join(rootDir, MENU_CONFIG_FILENAME);
  if (!(await fileExists(menuPath))) {
    return null;
  }

  try {
    const links = parseMenuConfig(await readFile(menuPath, "utf8"));
    return links.length > 0 ? links : null;
  } catch {
    return null;
  }
}

function sortNatural(values: string[]): string[] {
  return values.sort((a, b) => a.localeCompare(b, "ja", { numeric: true }));
}

function parentTocNum(tocNum: string): string {
  const dotIndex = tocNum.lastIndexOf(".");
  const dashIndex = tocNum.lastIndexOf("-");
  const splitIndex = Math.max(dotIndex, dashIndex);
  return splitIndex > 0 ? tocNum.slice(0, splitIndex) : tocNum;
}

function isSubTocNum(tocNum: string): boolean {
  return parentTocNum(tocNum) !== tocNum;
}

function mergeKey(relativePath: string, tocNum: string | null): string {
  if (tocNum) {
    return `toc:${tocNum}`;
  }
  return `path:${relativePath}`;
}

async function scanHtmlFiles(rootDir: string, currentDir = rootDir): Promise<string[]> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const entryPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await scanHtmlFiles(rootDir, entryPath)));
      continue;
    }

    if (entry.isFile() && isHtmlPath(entry.name)) {
      const relativePath = toPosix(path.relative(rootDir, entryPath));
      if (relativePath.toLowerCase() !== "index.html") {
        results.push(relativePath);
      }
    }
  }

  return sortNatural(results);
}

async function buildFallbackDeck(rootDir: string, rootName: string): Promise<Deck> {
  const htmlFiles = await scanHtmlFiles(rootDir);
  const pages: DeckPage[] = [];

  for (const relativePath of htmlFiles) {
    pages.push({
      id: relativePath,
      title: await inferPageTitle(path.join(rootDir, relativePath)),
      path: relativePath,
      href: relativePath,
      kind: "page",
      exists: true,
      children: [],
      anchors: []
    });
  }

  return {
    rootDir,
    rootName,
    pages,
    hasToc: false,
    warning: "目次がありません。フォルダ内のHTMLを自然順で表示しています。"
  };
}

function createExternalPage(link: TocLink): DeckPage {
  return {
    id: `external:${link.href}`,
    title: link.text || link.href,
    path: link.href,
    href: link.href,
    kind: "external",
    exists: true,
    children: [],
    anchors: [],
    reason: "外部リンク"
  };
}

function addAnchorIfNeeded(page: DeckPage, hash: string, title: string): void {
  if (!hash || page.anchors.some((anchor) => anchor.hash === hash)) {
    return;
  }
  page.anchors.push(makeAnchor(page.path, hash, title));
}

async function createInternalPage(
  rootDir: string,
  link: TocLink
): Promise<DeckPage | null> {
  const { pathPart, hash } = splitHref(link.href);
  if (!pathPart || !isHtmlPath(pathPart)) {
    return null;
  }

  const targetPath = path.resolve(rootDir, pathPart);
  const relativePath = toPosix(path.relative(rootDir, targetPath));
  if (relativePath.toLowerCase() === "index.html") {
    return null;
  }

  const pageId = link.tocNum ? `${relativePath}::${link.tocNum}` : relativePath;

  if (!isInsideRoot(rootDir, targetPath)) {
    return {
      id: `out-of-scope:${link.href}`,
      title: link.text || path.basename(pathPart),
      path: link.href,
      href: link.href,
      kind: "out-of-scope",
      exists: false,
      tocNum: link.tocNum ?? undefined,
      children: [],
      anchors: hash ? [makeAnchor(link.href, hash, link.text)] : [],
      reason: "範囲外"
    };
  }

  const exists = await fileExists(targetPath);
  const title = link.text || (exists ? await inferPageTitle(targetPath) : path.basename(pathPart));

  return {
    id: pageId,
    title,
    path: relativePath,
    href: hash ? `${relativePath}${hash}` : relativePath,
    kind: exists ? "page" : "missing",
    exists,
    tocNum: link.tocNum ?? undefined,
    children: [],
    anchors: hash && !link.tocNum ? [makeAnchor(relativePath, hash, link.text)] : [],
    reason: exists ? undefined : "見つかりません"
  };
}

function nestSubPages(pages: DeckPage[]): DeckPage[] {
  const pageByTocNum = new Map<string, DeckPage>();
  for (const page of pages) {
    if (page.tocNum) {
      page.children = [];
      pageByTocNum.set(page.tocNum, page);
    }
  }

  const roots: DeckPage[] = [];

  for (const page of pages) {
    if (page.tocNum && isSubTocNum(page.tocNum)) {
      const parent = pageByTocNum.get(parentTocNum(page.tocNum));
      if (parent) {
        parent.children.push(page);
        continue;
      }
    }
    roots.push(page);
  }

  return roots;
}

async function buildDeckFromTocLinks(
  rootDir: string,
  rootName: string,
  links: TocLink[]
): Promise<Deck> {
  const pages = new Map<string, DeckPage>();
  const orderedPages: DeckPage[] = [];

  for (const link of links) {
    if (/^https?:\/\//i.test(link.href)) {
      const externalPage = createExternalPage(link);
      if (!pages.has(externalPage.id)) {
        pages.set(externalPage.id, externalPage);
        orderedPages.push(externalPage);
      }
      continue;
    }

    const internalPage = await createInternalPage(rootDir, link);
    if (!internalPage) {
      continue;
    }

    const key =
      internalPage.kind === "out-of-scope"
        ? internalPage.id
        : mergeKey(internalPage.path, link.tocNum);

    const existingPage = pages.get(key);
    if (existingPage) {
      if (!existingPage.title && internalPage.title) {
        existingPage.title = internalPage.title;
      }
      const { hash } = splitHref(link.href);
      if (hash) {
        addAnchorIfNeeded(existingPage, hash, link.text);
      }
      continue;
    }

    pages.set(key, internalPage);
    orderedPages.push(internalPage);
  }

  if (orderedPages.length === 0) {
    return buildFallbackDeck(rootDir, rootName);
  }

  return {
    rootDir,
    rootName,
    pages: nestSubPages(orderedPages),
    hasToc: true
  };
}

export async function buildDeck(rootDir: string): Promise<Deck> {
  const rootName = path.basename(rootDir);

  const menuLinks = await loadMenuConfigLinks(rootDir);
  if (menuLinks) {
    return buildDeckFromTocLinks(rootDir, rootName, menuLinks);
  }

  const indexPath = path.join(rootDir, "index.html");
  const hasIndex = await fileExists(indexPath);

  if (!hasIndex) {
    return buildFallbackDeck(rootDir, rootName);
  }

  const links = extractTocLinks(await readHtml(indexPath));
  if (links.length === 0) {
    return buildFallbackDeck(rootDir, rootName);
  }

  return buildDeckFromTocLinks(rootDir, rootName, links);
}

export function localPathFromPage(rootDir: string, page: DeckPage): string | null {
  if (page.kind !== "page") {
    return null;
  }

  const targetPath = path.resolve(rootDir, page.path);
  return isInsideRoot(rootDir, targetPath) ? targetPath : null;
}

export function findDeckPageByHref(deck: Deck, href: string): DeckPage | undefined {
  const target = splitHref(href);
  return flattenDeckPages(deck.pages).find((candidate) => {
    if (candidate.kind !== "page") {
      return false;
    }
    const candidateTarget = splitHref(candidate.href);
    return candidateTarget.pathPart === target.pathPart && candidateTarget.hash === target.hash;
  });
}
