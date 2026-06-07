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
  Deck,
  FindRequest,
  FindResult,
  InputPoint,
  NavigationState,
  RecentFolder,
  ViewBounds
} from "../shared/types.js";
import { buildDeck, findDeckPageByHref, flattenDeckPages, splitHref } from "./deck.js";
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
let recentFolders: RecentFolder[] = [];
let zoomFactor = 1;
let isStoppingForQuit = false;
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
    await documentView.webContents.loadURL(
      localServer.toUrl(`${fallback.path}${parsed.hash}`)
    );
    return;
  }

  const { hash } = splitHref(href);
  await documentView.webContents.loadURL(localServer.toUrl(`${page.path}${hash}`));
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
ipcMain.handle("viewer:navigate", (_event, href: string) => loadHref(href));
ipcMain.handle("viewer:open-external", (_event, href: string) => shell.openExternal(href));
ipcMain.handle("viewer:set-bounds", (_event, bounds: ViewBounds) => setViewBounds(bounds));
ipcMain.handle("viewer:set-zoom-factor", (_event, factor: number) => {
  setBrowserZoomFactor(factor);
});
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
