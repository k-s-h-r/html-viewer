import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type {
  AddPageOptions,
  Deck,
  DeletePageOptions,
  DuplicatePageOptions,
  EditorApi,
  EditorDocument,
  FindRequest,
  FindResult,
  InputPoint,
  NavigationState,
  RecentFolder,
  SearchResult,
  TocEntry,
  TocSnapshot,
  ViewBounds,
  ViewerApi
} from "../shared/types.js";

function on<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T) => {
    callback(payload);
  };
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.off(channel, listener);
  };
}

const api: ViewerApi = {
  openFolder: () => ipcRenderer.invoke("folder:open") as Promise<Deck | null>,
  openRecentFolder: (path: string) =>
    ipcRenderer.invoke("folder:open-recent", path) as Promise<Deck | null>,
  getRecentFolders: () => ipcRenderer.invoke("folder:get-recent") as Promise<RecentFolder[]>,
  getCurrentDeck: () => ipcRenderer.invoke("deck:get-current") as Promise<Deck | null>,
  reload: () => ipcRenderer.invoke("viewer:reload") as Promise<Deck | null>,
  navigate: (href: string) => ipcRenderer.invoke("viewer:navigate", href) as Promise<void>,
  openExternal: (href: string) =>
    ipcRenderer.invoke("viewer:open-external", href) as Promise<void>,
  setViewBounds: (bounds: ViewBounds) =>
    ipcRenderer.invoke("viewer:set-bounds", bounds) as Promise<void>,
  setZoomFactor: (factor: number) =>
    ipcRenderer.invoke("viewer:set-zoom-factor", factor) as Promise<void>,
  search: (query: string, matchCase: boolean) =>
    ipcRenderer.invoke("search:query", query, matchCase) as Promise<SearchResult>,
  findInPage: (request: FindRequest) =>
    ipcRenderer.invoke("viewer:find-in-page", request) as Promise<void>,
  stopFindInPage: () => ipcRenderer.invoke("viewer:stop-find-in-page") as Promise<void>,
  openEditor: (pagePath: string) =>
    ipcRenderer.invoke("viewer:open-editor", pagePath) as Promise<void>,
  getToc: () => ipcRenderer.invoke("deck:get-toc") as Promise<TocSnapshot>,
  getMenuJsonText: () =>
    ipcRenderer.invoke("deck:get-menu-json-text") as Promise<string>,
  saveMenuJsonText: (text: string) =>
    ipcRenderer.invoke("deck:save-menu-json-text", text) as Promise<Deck>,
  updateToc: (entries: TocEntry[]) =>
    ipcRenderer.invoke("deck:update-toc", entries) as Promise<Deck>,
  addPage: (options: AddPageOptions) =>
    ipcRenderer.invoke("deck:add-page", options) as Promise<{ path: string }>,
  duplicatePage: (options: DuplicatePageOptions) =>
    ipcRenderer.invoke("deck:duplicate-page", options) as Promise<{ path: string }>,
  deletePage: (options: DeletePageOptions) =>
    ipcRenderer.invoke("deck:delete-page", options) as Promise<void>,
  focusSearch: (clickPoint?: InputPoint) =>
    ipcRenderer.invoke("viewer:focus-search", clickPoint) as Promise<void>,
  focusDocument: () => ipcRenderer.invoke("viewer:focus-document") as Promise<void>,
  focusSidebar: () => ipcRenderer.invoke("viewer:focus-sidebar") as Promise<void>,
  onDeckChanged: (callback: (deck: Deck) => void) => on("deck:changed", callback),
  onReloadRequested: (callback: () => void) => on("viewer:reload-requested", callback),
  onNavigationChanged: (callback: (state: NavigationState) => void) =>
    on("viewer:navigation-changed", callback),
  onFindResult: (callback: (result: FindResult) => void) =>
    on("viewer:find-result", callback),
  onZoomChanged: (callback: (factor: number) => void) =>
    on("viewer:zoom-changed", callback),
  onFocusSearch: (callback: () => void) => on("viewer:focus-search", callback),
  onUiFocusRestored: (callback: () => void) => on("viewer:ui-focus-restored", callback),
  onDocumentEscape: (callback: () => void) => on("viewer:document-escape", callback),
  onSidebarLayoutReset: (callback: () => void) => on("settings:reset-sidebar-layout", callback)
};

const editorApi: EditorApi = {
  getInitialDocument: () =>
    ipcRenderer.invoke("editor:get-initial-document") as Promise<EditorDocument | null>,
  savePage: (html: string) => ipcRenderer.invoke("editor:save-page", html) as Promise<void>,
  close: () => ipcRenderer.invoke("editor:close") as Promise<void>
};

contextBridge.exposeInMainWorld("editorApi", editorApi);
contextBridge.exposeInMainWorld("viewerApi", api);
