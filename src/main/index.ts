import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  shell,
  WebContentsView
} from "electron";
import type {
  AddPageOptions,
  Deck,
  DeckPage,
  DeletePageOptions,
  DuplicatePageOptions,
  EditorDocument,
  FindRequest,
  FindResult,
  InputPoint,
  NavigationState,
  RecentFolder,
  TocEntry,
  ViewBounds
} from "../shared/types.js";
import { addPage, deletePage, duplicatePage } from "./deckPages.js";
import { readMenuJsonText, readTocEntries, writeMenuJsonText, writeTocEntries } from "./deckToc.js";
import { buildDeck, findDeckPageByHref, flattenDeckPages, localPathFromPage, splitHref } from "./deck.js";
import { startLocalServer, type LocalServerHandle } from "./localServer.js";
import { SearchCatalog } from "./search.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RECENT_LIMIT = 8;
const startupFolder = process.env.HTML_VIEWER_OPEN_FOLDER;
const autoQuitMs = Number(process.env.HTML_VIEWER_AUTO_QUIT_MS ?? 0);

let mainWindow: BrowserWindow | null = null;
let documentView: WebContentsView | null = null;
let currentDeck: Deck | null = null;
let localServer: LocalServerHandle | null = null;
let searchCatalog: SearchCatalog | null = null;
const editorSessions = new Map<number, { pagePath: string }>();
let recentFolders: RecentFolder[] = [];
let zoomFactor = 1;
let isStoppingForQuit = false;
let documentNavigation: Promise<void> = Promise.resolve();
function recentFoldersPath(): string {
  return path.join(app.getPath("userData"), "recent-folders.json");
}

async function loadRecentFolders(): Promise<void> {
  try {
    const raw = await readFile(recentFoldersPath(), "utf8");
    recentFolders = JSON.parse(raw) as RecentFolder[];
  } catch {
    recentFolders = [];
  }
}

async function saveRecentFolders(): Promise<void> {
  await mkdir(app.getPath("userData"), { recursive: true });
  await writeFile(recentFoldersPath(), JSON.stringify(recentFolders, null, 2));
}

async function rememberFolder(folderPath: string): Promise<void> {
  recentFolders = [
    { path: folderPath, name: path.basename(folderPath) },
    ...recentFolders.filter((folder) => folder.path !== folderPath)
  ].slice(0, RECENT_LIMIT);
  await saveRecentFolders();
  buildAppMenu();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function showOpenFolderError(error: unknown): void {
  dialog.showErrorBox("仕様書フォルダを開けません", errorMessage(error));
}

function setBrowserZoomFactor(factor: number): void {
  zoomFactor = Math.min(2, Math.max(0.5, Number(factor.toFixed(2))));
  documentView?.webContents.setZoomFactor(zoomFactor);
  sendToRenderer("viewer:zoom-changed", zoomFactor);
}

function lockRendererZoom(window: BrowserWindow): void {
  window.webContents.setZoomFactor(1);
  window.webContents.setVisualZoomLevelLimits(1, 1);
  window.webContents.on("zoom-changed", () => {
    window.webContents.setZoomFactor(1);
  });
}

function adjustBrowserZoom(delta: number): void {
  setBrowserZoomFactor(zoomFactor + delta);
}

function buildAppMenu(): void {
  const recentSubmenu =
    recentFolders.length > 0
      ? recentFolders.map((folder) => ({
          label: folder.name,
          sublabel: folder.path,
          click: () => {
            void openFolderPath(folder.path).catch(showOpenFolderError);
          }
        }))
      : [{ label: "履歴がありません", enabled: false }];

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [{ role: "about" }, { type: "separator" }, { role: "quit" }]
    },
    {
      label: "ファイル",
      submenu: [
        {
          label: "フォルダを開く...",
          accelerator: "CmdOrCtrl+O",
          click: () => {
            void openFolderDialog().catch(showOpenFolderError);
          }
        },
        { label: "最近使ったフォルダ", submenu: recentSubmenu }
      ]
    },
    {
      label: "設定",
      submenu: [
        {
          label: "サイドバー幅を既定値に戻す",
          click: () => {
            sendToRenderer("settings:reset-sidebar-layout", null);
          }
        }
      ]
    },
    {
      label: "表示",
      submenu: [
        {
          label: "検索...",
          accelerator: "CmdOrCtrl+F",
          click: () => focusSearchInRenderer()
        },
        { type: "separator" },
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        {
          label: "100%に戻す",
          accelerator: "CmdOrCtrl+0",
          click: () => setBrowserZoomFactor(1)
        },
        {
          label: "拡大",
          accelerator: "CmdOrCtrl+=",
          click: () => adjustBrowserZoom(0.1)
        },
        {
          label: "縮小",
          accelerator: "CmdOrCtrl+-",
          click: () => adjustBrowserZoom(-0.1)
        },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function sendToRenderer(channel: string, payload: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send(channel, payload);
}

function clickRendererPoint(point: InputPoint): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const x = Math.round(point.x);
  const y = Math.round(point.y);
  mainWindow.webContents.sendInputEvent({ type: "mouseMove", x, y });
  mainWindow.webContents.sendInputEvent({
    type: "mouseDown",
    x,
    y,
    button: "left",
    clickCount: 1
  });
  mainWindow.webContents.sendInputEvent({
    type: "mouseUp",
    x,
    y,
    button: "left",
    clickCount: 1
  });
}

async function focusSearchInRenderer(clickPoint?: InputPoint): Promise<void> {
  focusRendererWebContents();
  if (clickPoint) {
    clickRendererPoint(clickPoint);
  }
  sendToRenderer("viewer:focus-search", null);
}

function focusRendererWebContents(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (process.platform === "darwin") {
    app.focus({ steal: true });
  }
  mainWindow.focus();
  mainWindow.webContents.focus();
}

function focusDocumentView(): void {
  if (!documentView || !mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (process.platform === "darwin") {
    app.focus({ steal: true });
  }
  mainWindow.focus();
  documentView.webContents.focus();
}

function focusSidebarInRenderer(): void {
  focusRendererWebContents();
  sendToRenderer("viewer:ui-focus-restored", null);
}

function registerDocumentKeyboardShortcuts(contents: Electron.WebContents): void {
  contents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") {
      return;
    }
    if ((input.control || input.meta) && input.key.toLowerCase() === "f") {
      event.preventDefault();
      setTimeout(() => focusSearchInRenderer(), 0);
      return;
    }
    if (input.key === "Escape") {
      event.preventDefault();
      sendToRenderer("viewer:document-escape", null);
    }
  });
}

function createDocumentView(): WebContentsView {
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      focusOnNavigation: false
    }
  });

  view.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  view.webContents.on("will-navigate", (event, url) => {
    if (!localServer || url.startsWith(localServer.origin)) {
      return;
    }
    event.preventDefault();
    void shell.openExternal(url);
  });

  view.webContents.on("did-navigate", (_event, url) => {
    sendToRenderer("viewer:navigation-changed", navigationStateFromUrl(url));
  });

  view.webContents.on("did-navigate-in-page", (_event, url) => {
    sendToRenderer("viewer:navigation-changed", navigationStateFromUrl(url));
  });

  view.webContents.on("found-in-page", (_event, result) => {
    const payload: FindResult = {
      requestId: result.requestId,
      activeMatchOrdinal: result.activeMatchOrdinal,
      matches: result.matches,
      finalUpdate: result.finalUpdate
    };
    sendToRenderer("viewer:find-result", payload);
  });

  registerDocumentKeyboardShortcuts(view.webContents);

  return view;
}

function navigationStateFromUrl(url: string): NavigationState {
  if (!localServer || !url.startsWith(localServer.origin)) {
    return { url };
  }

  const parsed = new URL(url);
  return {
    url,
    pagePath: decodeURIComponent(parsed.pathname).replace(/^\/+/, ""),
    hash: parsed.hash || undefined
  };
}

async function createMainWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    title: "HTML仕様書ビューワー",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  documentView = createDocumentView();
  documentView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  mainWindow.contentView.addChildView(documentView);

  const rendererUrl =
    process.env.VITE_DEV_SERVER_URL ??
    `file://${path.join(__dirname, "../../dist/index.html")}`;

  await mainWindow.loadURL(rendererUrl);
  lockRendererZoom(mainWindow);
}

async function stopLocalServer(): Promise<void> {
  if (!localServer) {
    return;
  }

  await localServer.stop();
  localServer = null;
}

function firstNavigablePage(deck: Deck): string | null {
  return deck.pages.find((page) => page.kind === "page")?.href ?? null;
}

function isNavigationAborted(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const record = error as { errno?: number; code?: string };
  return record.errno === -3 || record.code === "ERR_ABORTED";
}

async function runDocumentNavigation(task: () => Promise<void>): Promise<void> {
  const run = async () => {
    try {
      await task();
    } catch (error) {
      if (!isNavigationAborted(error)) {
        throw error;
      }
    }
  };
  const next = documentNavigation.then(run, run);
  documentNavigation = next.catch(() => {});
  return next;
}

async function loadDocumentUrl(url: string, reload = false): Promise<void> {
  if (!documentView) {
    return;
  }
  if (!reload && documentView.webContents.getURL() === url) {
    return;
  }
  await runDocumentNavigation(async () => {
    await documentView!.webContents.loadURL(url);
  });
}

async function reloadDocumentView(): Promise<void> {
  if (!documentView) {
    return;
  }

  await runDocumentNavigation(async () => {
    const webContents = documentView!.webContents;
    await new Promise<void>((resolve, reject) => {
      const onFinish = () => {
        cleanup();
        resolve();
      };
      const onFail = (
        _event: Electron.Event,
        errorCode: number,
        errorDescription: string,
        validatedURL: string
      ) => {
        cleanup();
        if (isNavigationAborted({ errno: errorCode, code: errorDescription })) {
          resolve();
          return;
        }
        reject(new Error(`${errorDescription} (${errorCode}) loading '${validatedURL}'`));
      };
      const cleanup = () => {
        webContents.removeListener("did-finish-load", onFinish);
        webContents.removeListener("did-fail-load", onFail);
      };
      webContents.once("did-finish-load", onFinish);
      webContents.once("did-fail-load", onFail);
      webContents.reloadIgnoringCache();
    });
  });
}

async function loadHref(href: string): Promise<void> {
  if (!documentView || !localServer || !currentDeck) {
    return;
  }

  if (/^https?:\/\//i.test(href)) {
    await shell.openExternal(href);
    return;
  }

  const page = findDeckPageByHref(currentDeck, href);
  if (!page) {
    const parsed = new URL(href, `${localServer.origin}/`);
    const pagePath = decodeURIComponent(parsed.pathname).replace(/^\/+/, "");
    const fallback = flattenDeckPages(currentDeck.pages).find(
      (candidate) => candidate.kind === "page" && candidate.path === pagePath
    );
    if (!fallback) {
      return;
    }
    await loadDocumentUrl(localServer.toUrl(`${fallback.path}${parsed.hash}`));
    return;
  }

  const { hash } = splitHref(href);
  await loadDocumentUrl(localServer.toUrl(`${page.path}${hash}`));
}

function findDeckPageByPath(pagePath: string): DeckPage | undefined {
  if (!currentDeck) {
    return undefined;
  }
  return flattenDeckPages(currentDeck.pages).find(
    (page) => page.kind === "page" && page.path === pagePath
  );
}

function editorRendererUrl(): string {
  if (process.env.VITE_DEV_SERVER_URL) {
    return new URL("editor.html", process.env.VITE_DEV_SERVER_URL).toString();
  }
  return `file://${path.join(__dirname, "../../dist/editor.html")}`;
}

async function resolveEditorTarget(
  pagePath: string
): Promise<{ filePath: string; resolvedPagePath: string; name: string }> {
  if (!currentDeck || !localServer) {
    throw new Error("編集する仕様書フォルダが開かれていません。");
  }

  const normalizedPath = pagePath.split(path.sep).join("/");
  if (normalizedPath.toLowerCase() === "index.html") {
    const filePath = path.join(currentDeck.rootDir, "index.html");
    if (!isInsideDeckRoot(filePath)) {
      throw new Error("編集対象のHTMLページが仕様書フォルダ外です。");
    }
    return {
      filePath,
      resolvedPagePath: "index.html",
      name: "index.html"
    };
  }

  const page = findDeckPageByPath(pagePath);
  if (!page) {
    throw new Error("編集対象のHTMLページが見つかりません。");
  }

  const filePath = localPathFromPage(currentDeck.rootDir, page);
  if (!filePath) {
    throw new Error("編集対象のHTMLページが仕様書フォルダ外です。");
  }

  return {
    filePath,
    resolvedPagePath: page.path,
    name: path.basename(page.path)
  };
}

function isInsideDeckRoot(targetPath: string): boolean {
  if (!currentDeck) {
    return false;
  }
  const relative = path.relative(currentDeck.rootDir, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function editorDocumentForPage(pagePath: string): Promise<EditorDocument> {
  const target = await resolveEditorTarget(pagePath);

  return {
    html: await readFile(target.filePath, "utf8"),
    name: target.name,
    pagePath: target.resolvedPagePath,
    baseHref: new URL("./", localServer!.toUrl(target.resolvedPagePath)).toString()
  };
}

async function openEditorWindow(pagePath: string): Promise<void> {
  const initialDocument = await editorDocumentForPage(pagePath);

  const editorWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    title: `HTML仕様書エディター - ${initialDocument.name}`,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  editorSessions.set(editorWindow.webContents.id, {
    pagePath: initialDocument.pagePath
  });
  editorWindow.on("closed", () => {
    editorSessions.delete(editorWindow.webContents.id);
  });

  await editorWindow.loadURL(editorRendererUrl());
}

function currentDocumentPagePath(): string | null {
  if (!documentView || !localServer) {
    return null;
  }

  const url = documentView.webContents.getURL();
  if (!url.startsWith(localServer.origin)) {
    return null;
  }

  return navigationStateFromUrl(url).pagePath ?? null;
}

async function refreshDocumentViewIfShowingPage(pagePath: string): Promise<void> {
  if (!documentView || !localServer || currentDocumentPagePath() !== pagePath) {
    return;
  }

  const currentUrl = documentView.webContents.getURL();
  if (!currentUrl.startsWith(localServer.origin)) {
    return;
  }

  await reloadDocumentView();
}

async function saveEditorPage(webContentsId: number, html: string): Promise<void> {
  if (!currentDeck) {
    throw new Error("保存先の仕様書フォルダが開かれていません。");
  }

  const session = editorSessions.get(webContentsId);
  if (!session) {
    throw new Error("編集セッションが見つかりません。");
  }

  const target = await resolveEditorTarget(session.pagePath);

  await writeFile(target.filePath, html, "utf8");

  if (target.resolvedPagePath.toLowerCase() === "index.html") {
    await refreshCurrentDeck();
    return;
  }

  const page = findDeckPageByPath(session.pagePath);
  if (!page) {
    throw new Error("保存先のHTMLページが見つかりません。");
  }

  searchCatalog = await SearchCatalog.create(currentDeck.rootDir, currentDeck);
  await refreshDocumentViewIfShowingPage(page.path);
}

async function openFolderDialog(): Promise<Deck | null> {
  if (!mainWindow) {
    return null;
  }

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "仕様書フォルダを選択"
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return openFolderPath(result.filePaths[0]);
}

function requireCurrentDeckRoot(): string {
  if (!currentDeck) {
    throw new Error("仕様書フォルダが開かれていません。");
  }
  return currentDeck.rootDir;
}

async function refreshCurrentDeck(): Promise<Deck> {
  const rootDir = requireCurrentDeckRoot();
  const deck = await buildDeck(rootDir);
  searchCatalog = await SearchCatalog.create(rootDir, deck);
  currentDeck = deck;
  sendToRenderer("deck:changed", deck);
  return deck;
}

async function openFolderPath(folderPath: string): Promise<Deck> {
  await stopLocalServer();

  const deck = await buildDeck(folderPath);
  const server = await startLocalServer(folderPath);
  const catalog = await SearchCatalog.create(folderPath, deck);

  currentDeck = deck;
  localServer = server;
  searchCatalog = catalog;
  await rememberFolder(folderPath);

  sendToRenderer("deck:changed", deck);

  const firstPageHref = firstNavigablePage(deck);
  if (firstPageHref) {
    await loadHref(firstPageHref);
  }

  return deck;
}

function setViewBounds(bounds: ViewBounds): void {
  if (!documentView) {
    return;
  }

  documentView.setBounds({
    x: Math.max(0, Math.round(bounds.x)),
    y: Math.max(0, Math.round(bounds.y)),
    width: Math.max(0, Math.round(bounds.width)),
    height: Math.max(0, Math.round(bounds.height))
  });
}

ipcMain.handle("folder:open", () => openFolderDialog());
ipcMain.handle("folder:open-recent", (_event, folderPath: string) => openFolderPath(folderPath));
ipcMain.handle("folder:get-recent", () => recentFolders);
ipcMain.handle("deck:get-current", () => currentDeck);
ipcMain.handle("deck:get-toc", () => readTocEntries(requireCurrentDeckRoot()));
ipcMain.handle("deck:get-menu-json-text", () => readMenuJsonText(requireCurrentDeckRoot()));
ipcMain.handle("deck:save-menu-json-text", async (_event, text: string) => {
  const rootDir = requireCurrentDeckRoot();
  await writeMenuJsonText(rootDir, text);
  return refreshCurrentDeck();
});
ipcMain.handle("deck:update-toc", async (_event, entries: TocEntry[]) => {
  const rootDir = requireCurrentDeckRoot();
  const snapshot = await readTocEntries(rootDir);
  await writeTocEntries(rootDir, snapshot.source, entries);
  return refreshCurrentDeck();
});
ipcMain.handle("deck:add-page", async (_event, options: AddPageOptions) => {
  const rootDir = requireCurrentDeckRoot();
  const result = await addPage(rootDir, options);
  await refreshCurrentDeck();
  return result;
});
ipcMain.handle("deck:duplicate-page", async (_event, options: DuplicatePageOptions) => {
  const rootDir = requireCurrentDeckRoot();
  const result = await duplicatePage(rootDir, options);
  await refreshCurrentDeck();
  return result;
});
ipcMain.handle("deck:delete-page", async (_event, options: DeletePageOptions) => {
  const rootDir = requireCurrentDeckRoot();
  const result = await deletePage(rootDir, options);
  await refreshCurrentDeck();
  return result;
});
ipcMain.handle("viewer:navigate", (_event, href: string) => loadHref(href));
ipcMain.handle("viewer:open-external", (_event, href: string) => shell.openExternal(href));
ipcMain.handle("viewer:set-bounds", (_event, bounds: ViewBounds) => setViewBounds(bounds));
ipcMain.handle("viewer:set-zoom-factor", (_event, factor: number) => {
  setBrowserZoomFactor(factor);
});
ipcMain.handle("viewer:open-editor", (_event, pagePath: string) =>
  openEditorWindow(pagePath)
);
ipcMain.handle("search:query", (_event, query: string, matchCase: boolean) => {
  return (
    searchCatalog?.query(query, matchCase) ?? {
      query,
      matchCase,
      totalHits: 0,
      pages: []
    }
  );
});
ipcMain.handle("viewer:focus-search", (_event, clickPoint?: InputPoint) =>
  focusSearchInRenderer(clickPoint)
);
ipcMain.handle("viewer:focus-document", () => {
  focusDocumentView();
});
ipcMain.handle("viewer:focus-sidebar", () => {
  focusSidebarInRenderer();
});
ipcMain.handle("viewer:find-in-page", async (_event, request: FindRequest) => {
  if (!documentView || !request.query) {
    return;
  }
  if (request.findNext) {
    // Blink starts find-in-page from the current selection. For a new search
    // session we clear the selection first so the search begins from the top
    // and lands on the first match. See electron/electron#34490.
    try {
      await documentView.webContents.executeJavaScript(
        "window.getSelection && window.getSelection().removeAllRanges();",
        true
      );
    } catch {
      // The document may not be ready yet; ignore and search anyway.
    }
  }
  documentView.webContents.findInPage(request.query, {
    forward: request.forward,
    findNext: request.findNext,
    matchCase: request.matchCase
  });
});
ipcMain.handle("viewer:stop-find-in-page", () => {
  documentView?.webContents.stopFindInPage("clearSelection");
});
ipcMain.handle("editor:get-initial-document", (event) => {
  const session = editorSessions.get(event.sender.id);
  return session ? editorDocumentForPage(session.pagePath) : null;
});
ipcMain.handle("editor:save-page", (event, html: string) =>
  saveEditorPage(event.sender.id, html)
);
ipcMain.handle("editor:close", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  window?.close();
});

app
  .whenReady()
  .then(async () => {
    await loadRecentFolders();
    buildAppMenu();
    await createMainWindow();

    if (startupFolder) {
      await openFolderPath(startupFolder);
    }

    if (Number.isFinite(autoQuitMs) && autoQuitMs > 0) {
      setTimeout(() => app.quit(), autoQuitMs);
    }
  })
  .catch((error: unknown) => {
    console.error(error);
    app.exit(1);
  });

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createMainWindow();
  }
});

app.on("before-quit", (event) => {
  if (!localServer || isStoppingForQuit) {
    return;
  }

  event.preventDefault();
  isStoppingForQuit = true;
  void stopLocalServer().finally(() => app.quit());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
