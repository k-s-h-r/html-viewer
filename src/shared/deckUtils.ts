import type { DeckPage } from "./types.js";

export function splitHref(href: string): { pathPart: string; hash: string } {
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

export function absolutePagePath(rootDir: string, pagePath: string): string {
  const root = rootDir.replace(/[\\/]+$/, "");
  const segments = pagePath.replace(/\\/g, "/").split("/").filter(Boolean);
  const useWindowsSep = /^[A-Za-z]:[\\/]/.test(root);
  const sep = useWindowsSep ? "\\" : "/";
  return [root, ...segments].join(sep);
}

export function flattenDeckPages(pages: DeckPage[]): DeckPage[] {
  const result: DeckPage[] = [];
  const walk = (page: DeckPage) => {
    result.push(page);
    for (const child of page.children) {
      walk(child);
    }
  };
  for (const page of pages) {
    walk(page);
  }
  return result;
}
