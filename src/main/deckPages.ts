import { copyFile, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { load } from "cheerio";
import { splitHref } from "../shared/deckUtils.js";
import type {
  AddPageOptions,
  DeletePageOptions,
  DuplicatePageOptions,
  TocEntry
} from "../shared/deckToc.js";
import { readTocEntries, writeTocEntries } from "./deckToc.js";

function toPosix(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

function isInsideRoot(rootDir: string, targetPath: string): boolean {
  const relative = path.relative(rootDir, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
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

function ensureHtmlExtension(fileName: string): string {
  return /\.html?$/i.test(fileName) ? fileName : `${fileName}.html`;
}

function slugifyTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "new-page";
}

export async function suggestNewPagePath(
  rootDir: string,
  preferredName?: string
): Promise<string> {
  const baseName = ensureHtmlExtension(preferredName ?? "new-page.html");
  const stem = path.basename(baseName, path.extname(baseName));
  const ext = path.extname(baseName);
  let candidate = `${stem}${ext}`;
  let counter = 2;

  while (await fileExists(path.join(rootDir, candidate))) {
    candidate = `${stem}-${counter}${ext}`;
    counter += 1;
  }

  return toPosix(candidate);
}

function insertEntry(
  entries: TocEntry[],
  newEntry: TocEntry,
  insertAfter?: string
): TocEntry[] {
  if (!insertAfter) {
    return [...entries, newEntry];
  }

  const index = entries.findIndex((entry) => entry.href === insertAfter);
  if (index < 0) {
    return [...entries, newEntry];
  }

  return [...entries.slice(0, index + 1), newEntry, ...entries.slice(index + 1)];
}

export async function createPageTemplate(rootDir: string, title: string): Promise<string> {
  const htmlFiles = await (async () => {
    const { readdir } = await import("node:fs/promises");
    const results: string[] = [];
    async function walk(currentDir: string): Promise<void> {
      const entries = await readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        const entryPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await walk(entryPath);
          continue;
        }
        if (entry.isFile() && /\.html?$/i.test(entry.name)) {
          const relativePath = toPosix(path.relative(rootDir, entryPath));
          if (relativePath.toLowerCase() !== "index.html") {
            results.push(relativePath);
          }
        }
      }
    }
    await walk(rootDir);
    return results.sort((a, b) => a.localeCompare(b, "ja", { numeric: true }));
  })();

  if (htmlFiles.length > 0) {
    const sample = await readFile(path.join(rootDir, htmlFiles[0]), "utf8");
    const $ = load(sample);
    const stylesheet = $("link[rel='stylesheet']").first().attr("href");
    if (stylesheet) {
      return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <link rel="stylesheet" href="${stylesheet}" />
  </head>
  <body>
    <div class="doc">
      <header class="doc-header">
        <h1 class="doc-title">${title}</h1>
      </header>
      <main class="doc-body">
        <section class="doc-section">
          <p>ここに内容を記載します。</p>
        </section>
      </main>
    </div>
  </body>
</html>
`;
    }
  }

  return emptyDocumentHtml(title);
}

function emptyDocumentHtml(title: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
<style>
  body {
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    font-size: 16px;
    line-height: 1.7;
    max-width: 880px;
    margin: 40px auto;
    padding: 0 24px;
    color: #1f2937;
    background: #ffffff;
  }
  h1 { font-size: 32px; line-height: 1.3; }
  p { margin: 0 0 1em; }
</style>
</head>
<body>
<h1>${title}</h1>
<p>ここに内容を記載します。</p>
</body>
</html>
`;
}

export async function createPageFile(
  rootDir: string,
  relativePath: string,
  html: string
): Promise<void> {
  const targetPath = path.resolve(rootDir, relativePath);
  if (!isInsideRoot(rootDir, targetPath)) {
    throw new Error("ページの保存先が仕様書フォルダ外です。");
  }

  if (await fileExists(targetPath)) {
    throw new Error(`既に存在するファイルです: ${relativePath}`);
  }

  await writeFile(targetPath, html, "utf8");
}

function updatePageTitleInHtml(html: string, title: string): string {
  const $ = load(html);
  $("title").first().text(title);
  const docTitle = $(".doc-title").first();
  if (docTitle.length) {
    docTitle.text(title);
  } else {
    $("h1").first().text(title);
  }
  const doctype = html.match(/^<!doctype[^>]*>/i)?.[0] ?? "<!doctype html>";
  const serialized = $.html();
  return serialized.startsWith("<!") ? serialized : `${doctype}\n${serialized}`;
}

export async function addPage(
  rootDir: string,
  options: AddPageOptions
): Promise<{ path: string }> {
  const relativePath = toPosix(
    await (options.relativePath
      ? suggestNewPagePath(rootDir, options.relativePath)
      : suggestNewPagePath(rootDir, `${slugifyTitle(options.title)}.html`))
  );

  const html = options.html ?? (await createPageTemplate(rootDir, options.title));
  await createPageFile(rootDir, relativePath, html);

  const snapshot = await readTocEntries(rootDir);
  const nextEntries = insertEntry(
    snapshot.entries,
    { href: relativePath, title: options.title },
    options.insertAfter
  );
  await writeTocEntries(rootDir, snapshot.source, nextEntries);

  return { path: relativePath };
}

export async function duplicatePage(
  rootDir: string,
  options: DuplicatePageOptions
): Promise<{ path: string }> {
  const sourcePath = toPosix(options.sourcePath);
  const sourceFile = path.resolve(rootDir, sourcePath);
  if (!isInsideRoot(rootDir, sourceFile)) {
    throw new Error("複製元のページが仕様書フォルダ外です。");
  }
  if (!(await fileExists(sourceFile))) {
    throw new Error("複製元のページが見つかりません。");
  }

  const sourceHtml = await readFile(sourceFile, "utf8");
  const sourceTitle =
    load(sourceHtml)("title").first().text().trim() ||
    path.basename(sourcePath, path.extname(sourcePath));
  const title = options.title ?? `${sourceTitle} のコピー`;

  const preferredName = options.relativePath
    ? options.relativePath
    : `${path.basename(sourcePath, path.extname(sourcePath))}-copy.html`;
  const relativePath = toPosix(await suggestNewPagePath(rootDir, preferredName));

  const destFile = path.resolve(rootDir, relativePath);
  await copyFile(sourceFile, destFile);
  const updatedHtml = updatePageTitleInHtml(await readFile(destFile, "utf8"), title);
  await writeFile(destFile, updatedHtml, "utf8");

  const snapshot = await readTocEntries(rootDir);
  const nextEntries = insertEntry(
    snapshot.entries,
    { href: relativePath, title },
    options.insertAfter ?? sourcePath
  );
  await writeTocEntries(rootDir, snapshot.source, nextEntries);

  return { path: relativePath };
}

function entryReferencesPage(entry: TocEntry, targetPath: string): boolean {
  return splitHref(entry.href).pathPart === targetPath;
}

export async function deletePage(
  rootDir: string,
  options: DeletePageOptions
): Promise<{ path: string }> {
  const targetPath = toPosix(options.targetPath);

  if (targetPath.toLowerCase() === "index.html") {
    throw new Error("index.html は削除できません。");
  }

  const targetFile = path.resolve(rootDir, targetPath);
  if (!isInsideRoot(rootDir, targetFile)) {
    throw new Error("削除対象のページが仕様書フォルダ外です。");
  }
  if (!(await fileExists(targetFile))) {
    throw new Error("削除対象のページが見つかりません。");
  }

  const snapshot = await readTocEntries(rootDir);
  const nextEntries = snapshot.entries.filter(
    (entry) => !entryReferencesPage(entry, targetPath)
  );

  if (nextEntries.length === snapshot.entries.length) {
    throw new Error("目次に登録されていないページです。");
  }
  if (nextEntries.length === 0) {
    throw new Error("目次が空になるため削除できません。");
  }

  await unlink(targetFile);
  await writeTocEntries(rootDir, snapshot.source, nextEntries);

  return { path: targetPath };
}
