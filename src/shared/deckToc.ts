export type TocSourceKind = "menu-json" | "index-html" | "fallback";

export interface TocSource {
  kind: TocSourceKind;
}

export interface TocEntry {
  href: string;
  title: string;
  num?: string;
}

export interface TocSnapshot {
  source: TocSource;
  entries: TocEntry[];
}

export interface AddPageOptions {
  relativePath?: string;
  title: string;
  insertAfter?: string;
  html?: string;
}

export interface DuplicatePageOptions {
  sourcePath: string;
  relativePath?: string;
  title?: string;
  insertAfter?: string;
}

export interface DeletePageOptions {
  targetPath: string;
}
