export type LinkKind = "page" | "missing" | "out-of-scope" | "external";

export interface DeckAnchor {
  id: string;
  title: string;
  href: string;
  hash: string;
}

export interface DeckPage {
  id: string;
  title: string;
  path: string;
  href: string;
  kind: LinkKind;
  exists: boolean;
  anchors: DeckAnchor[];
  reason?: string;
}

export interface Deck {
  rootDir: string;
  rootName: string;
  pages: DeckPage[];
  hasToc: boolean;
  warning?: string;
}

export interface SearchHit {
  id: string;
  pageId: string;
  pageTitle: string;
  pagePath: string;
  index: number;
  ordinal: number;
  snippet: string;
}

export interface PageSearchResult {
  pageId: string;
  pageTitle: string;
  pagePath: string;
  count: number;
  hits: SearchHit[];
}

export interface SearchResult {
  query: string;
  matchCase: boolean;
  totalHits: number;
  pages: PageSearchResult[];
}

export interface ViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FindRequest {
  query: string;
  forward: boolean;
  findNext: boolean;
  matchCase: boolean;
}

export interface FindResult {
  requestId: number;
  activeMatchOrdinal: number;
  matches: number;
  finalUpdate: boolean;
}

export interface NavigationState {
  url: string;
  pagePath?: string;
  hash?: string;
}

export interface RecentFolder {
  path: string;
  name: string;
}

export interface ViewerApi {
  openFolder(): Promise<Deck | null>;
  openRecentFolder(path: string): Promise<Deck | null>;
  getRecentFolders(): Promise<RecentFolder[]>;
  getCurrentDeck(): Promise<Deck | null>;
  navigate(href: string): Promise<void>;
  openExternal(href: string): Promise<void>;
  setViewBounds(bounds: ViewBounds): Promise<void>;
  setZoomFactor(factor: number): Promise<void>;
  search(query: string, matchCase: boolean): Promise<SearchResult>;
  findInPage(request: FindRequest): Promise<void>;
  stopFindInPage(): Promise<void>;
  onDeckChanged(callback: (deck: Deck) => void): () => void;
  onNavigationChanged(callback: (state: NavigationState) => void): () => void;
  onFindResult(callback: (result: FindResult) => void): () => void;
  onZoomChanged(callback: (factor: number) => void): () => void;
}
