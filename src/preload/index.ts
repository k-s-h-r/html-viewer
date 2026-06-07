import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type {
  Deck,
  FindRequest,
  FindResult,
  InputPoint,
  NavigationState,
  RecentFolder,
  SearchResult,
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
  focusSearch: (clickPoint?: InputPoint) =>
    ipcRenderer.invoke("viewer:focus-search", clickPoint) as Promise<void>,
  focusDocument: () => ipcRenderer.invoke("viewer:focus-document") as Promise<void>,
  focusSidebar: () => ipcRenderer.invoke("viewer:focus-sidebar") as Promise<void>,
  onDeckChanged: (callback: (deck: Deck) => void) => on("deck:changed", callback),
  onNavigationChanged: (callback: (state: NavigationState) => void) =>
    on("viewer:navigation-changed", callback),
  onFindResult: (callback: (result: FindResult) => void) =>
    on("viewer:find-result", callback),
  onZoomChanged: (callback: (factor: number) => void) =>
    on("viewer:zoom-changed", callback),
  onFocusSearch: (callback: () => void) => on("viewer:focus-search", callback),
  onUiFocusRestored: (callback: () => void) => on("viewer:ui-focus-restored", callback),
  onDocumentEscape: (callback: () => void) => on("viewer:document-escape", callback)
};

contextBridge.exposeInMainWorld("viewerApi", api);
