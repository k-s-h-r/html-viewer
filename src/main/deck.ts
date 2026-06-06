import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { load } from "cheerio";
import type { Deck, DeckAnchor, DeckPage } from "../shared/types.js";

interface TocLink {
  href: string;
  text: string;
}

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

function splitHref(href: string): { pathPart: string; hash: string } {
  const trimmed = href.trim();
  const hashIndex = trimmed.indexOf("#");
  const beforeHash = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed;
  const hash = hashIndex >= 0 ? trimmed.slice(hashIndex) : "";
  const queryIndex = beforeHash.indexOf("?");
  return {
    pathPart: queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash,
    hash
  };
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

function extractTocLinks(indexHtml: string): TocLink[] {
  const $ = load(indexHtml);
  return $("a[href]")
    .toArray()
    .map((element) => ({
      href: String($(element).attr("href") ?? "").trim(),
      text: $(element).text().replace(/\s+/g, " ").trim()
    }))
    .filter((link) => link.href.length > 0);
}

function sortNatural(values: string[]): string[] {
  return values.sort((a, b) => a.localeCompare(b, "ja", { numeric: true }));
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

  if (!isInsideRoot(rootDir, targetPath)) {
    return {
      id: `out-of-scope:${link.href}`,
      title: link.text || path.basename(pathPart),
      path: link.href,
      href: link.href,
      kind: "out-of-scope",
      exists: false,
      anchors: hash ? [makeAnchor(link.href, hash, link.text)] : [],
      reason: "範囲外"
    };
  }

  const exists = await fileExists(targetPath);
  const title = link.text || (exists ? await inferPageTitle(targetPath) : path.basename(pathPart));

  return {
    id: relativePath,
    title,
    path: relativePath,
    href: hash ? `${relativePath}${hash}` : relativePath,
    kind: exists ? "page" : "missing",
    exists,
    anchors: hash ? [makeAnchor(relativePath, hash, link.text)] : [],
    reason: exists ? undefined : "見つかりません"
  };
}

export async function buildDeck(rootDir: string): Promise<Deck> {
  const rootName = path.basename(rootDir);
  const indexPath = path.join(rootDir, "index.html");
  const hasIndex = await fileExists(indexPath);

  if (!hasIndex) {
    return buildFallbackDeck(rootDir, rootName);
  }

  const links = extractTocLinks(await readHtml(indexPath));
  if (links.length === 0) {
    return buildFallbackDeck(rootDir, rootName);
  }

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

    const existingPage = pages.get(internalPage.id);
    if (existingPage) {
      if (!existingPage.title && internalPage.title) {
        existingPage.title = internalPage.title;
      }
      for (const anchor of internalPage.anchors) {
        addAnchorIfNeeded(existingPage, anchor.hash, anchor.title);
      }
      continue;
    }

    pages.set(internalPage.id, internalPage);
    orderedPages.push(internalPage);
  }

  if (orderedPages.length === 0) {
    return buildFallbackDeck(rootDir, rootName);
  }

  return {
    rootDir,
    rootName,
    pages: orderedPages,
    hasToc: true
  };
}

export function localPathFromPage(rootDir: string, page: DeckPage): string | null {
  if (page.kind !== "page") {
    return null;
  }

  const targetPath = path.resolve(rootDir, page.path);
  return isInsideRoot(rootDir, targetPath) ? targetPath : null;
}
