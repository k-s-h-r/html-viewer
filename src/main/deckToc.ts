import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { load } from "cheerio";
import type { TocEntry, TocSnapshot, TocSource } from "../shared/deckToc.js";

const MENU_CONFIG_FILENAME = "menu.json";

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

function toPosix(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const { stat } = await import("node:fs/promises");
    const fileStat = await stat(filePath);
    return fileStat.isFile();
  } catch {
    return false;
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
    .filter(
      (page): page is MenuConfigPage =>
        typeof page?.href === "string" && page.href.trim().length > 0
    )
    .map((page) => ({
      href: page.href.trim(),
      text: page.title?.trim() ?? "",
      tocNum: page.num?.trim() ? page.num.trim() : null
    }));
}

function isHtmlPath(pathPart: string): boolean {
  return /\.html?$/i.test(pathPart);
}

function sortNatural(values: string[]): string[] {
  return values.sort((a, b) => a.localeCompare(b, "ja", { numeric: true }));
}

async function scanHtmlFiles(rootDir: string, currentDir = rootDir): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
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

async function inferPageTitle(filePath: string): Promise<string> {
  try {
    const html = await readFile(filePath, "utf8");
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

function toTocEntry(link: TocLink): TocEntry {
  return {
    href: link.href,
    title: link.text,
    ...(link.tocNum ? { num: link.tocNum } : {})
  };
}

export async function detectTocSource(rootDir: string): Promise<TocSource> {
  const menuLinks = await loadMenuConfigLinks(rootDir);
  if (menuLinks) {
    return { kind: "menu-json" };
  }

  const indexPath = path.join(rootDir, "index.html");
  if (await fileExists(indexPath)) {
    const links = extractTocLinks(await readFile(indexPath, "utf8"));
    if (links.length > 0) {
      return { kind: "index-html" };
    }
  }

  return { kind: "fallback" };
}

export async function readTocEntries(rootDir: string): Promise<TocSnapshot> {
  const menuLinks = await loadMenuConfigLinks(rootDir);
  if (menuLinks) {
    return {
      source: { kind: "menu-json" },
      entries: menuLinks.map(toTocEntry)
    };
  }

  const indexPath = path.join(rootDir, "index.html");
  if (await fileExists(indexPath)) {
    const links = extractTocLinks(await readFile(indexPath, "utf8"));
    if (links.length > 0) {
      return {
        source: { kind: "index-html" },
        entries: links.map(toTocEntry)
      };
    }
  }

  const htmlFiles = await scanHtmlFiles(rootDir);
  const entries: TocEntry[] = [];
  for (const relativePath of htmlFiles) {
    entries.push({
      href: relativePath,
      title: await inferPageTitle(path.join(rootDir, relativePath))
    });
  }

  return {
    source: { kind: "fallback" },
    entries
  };
}

function isInsideRoot(rootDir: string, targetPath: string): boolean {
  const relative = path.relative(rootDir, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function renderIndexTocItem(entry: TocEntry): string {
  const num = entry.num
    ? `<span class="toc-num">${entry.num}</span>`
    : "";
  const name = entry.title
    ? `<span class="toc-name">${entry.title}</span>`
    : "";
  const body = name ? `<span class="toc-body">${name}</span>` : "";

  return `<li>
              <a class="toc-link" href="${entry.href}">
                ${num}
                ${body}
              </a>
            </li>`;
}

async function writeMenuConfig(rootDir: string, entries: TocEntry[]): Promise<void> {
  const menuPath = path.join(rootDir, MENU_CONFIG_FILENAME);
  if (!isInsideRoot(rootDir, menuPath)) {
    throw new Error("menu.json の保存先がフォルダ外です。");
  }

  const pages = entries.map((entry) => ({
    href: entry.href,
    ...(entry.title ? { title: entry.title } : {}),
    ...(entry.num ? { num: entry.num } : {})
  }));

  await writeFile(menuPath, `${JSON.stringify({ pages }, null, 2)}\n`, "utf8");
}

async function writeIndexHtmlToc(rootDir: string, entries: TocEntry[]): Promise<void> {
  const indexPath = path.join(rootDir, "index.html");
  if (!isInsideRoot(rootDir, indexPath)) {
    throw new Error("index.html の保存先がフォルダ外です。");
  }

  const html = await readFile(indexPath, "utf8");
  const $ = load(html);
  const tocList = $("ol.toc-list").first();
  if (!tocList.length) {
    throw new Error(
      "index.html に ol.toc-list が見つかりません。menu.json で目次を管理してください。"
    );
  }

  tocList.empty();
  for (const entry of entries) {
    tocList.append(renderIndexTocItem(entry));
  }

  const doctype = html.match(/^<!doctype[^>]*>/i)?.[0] ?? "<!doctype html>";
  const serialized = $.root().children().length > 0 ? $.html() : $.root().html() ?? "";
  const output = serialized.startsWith("<!") ? serialized : `${doctype}\n${serialized}`;
  await writeFile(indexPath, output.endsWith("\n") ? output : `${output}\n`, "utf8");
}

function menuJsonFromEntries(entries: TocEntry[]): string {
  const pages = entries.map((entry) => ({
    href: entry.href,
    ...(entry.title ? { title: entry.title } : {}),
    ...(entry.num ? { num: entry.num } : {})
  }));
  return `${JSON.stringify({ pages }, null, 2)}\n`;
}

export async function readMenuJsonText(rootDir: string): Promise<string> {
  const menuPath = path.join(rootDir, MENU_CONFIG_FILENAME);
  if (await fileExists(menuPath)) {
    return readFile(menuPath, "utf8");
  }

  const snapshot = await readTocEntries(rootDir);
  return menuJsonFromEntries(snapshot.entries);
}

export async function writeMenuJsonText(rootDir: string, text: string): Promise<void> {
  let links: TocLink[];
  try {
    links = parseMenuConfig(text);
  } catch {
    throw new Error("menu.json の JSON 形式が正しくありません。");
  }

  if (links.length === 0) {
    throw new Error("menu.json の pages が空です。");
  }

  const menuPath = path.join(rootDir, MENU_CONFIG_FILENAME);
  if (!isInsideRoot(rootDir, menuPath)) {
    throw new Error("menu.json の保存先がフォルダ外です。");
  }

  const normalized = menuJsonFromEntries(links.map(toTocEntry));
  await writeFile(menuPath, normalized, "utf8");
}

export async function writeTocEntries(
  rootDir: string,
  source: TocSource,
  entries: TocEntry[]
): Promise<void> {
  if (entries.length === 0) {
    throw new Error("目次を空にすることはできません。");
  }

  const effectiveSource = source.kind === "fallback" ? { kind: "menu-json" as const } : source;

  if (effectiveSource.kind === "menu-json") {
    await writeMenuConfig(rootDir, entries);
    return;
  }

  await writeIndexHtmlToc(rootDir, entries);
}
