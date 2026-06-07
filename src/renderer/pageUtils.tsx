import { ExternalLink, FileText, FileWarning, FileX } from "lucide-react";
import type { Deck, DeckPage } from "../shared/types";
import { flattenDeckPages, splitHref } from "../shared/deckUtils";

export { flattenDeckPages };

export function canNavigate(page: DeckPage): boolean {
  return page.kind === "page" || page.kind === "external";
}

export function statusLabel(page: DeckPage): string {
  if (page.kind === "missing") {
    return "見つかりません";
  }
  if (page.kind === "out-of-scope") {
    return "範囲外";
  }
  if (page.kind === "external") {
    return "外部リンク";
  }
  return page.path;
}

export function pageIcon(page: DeckPage) {
  if (page.kind === "missing") {
    return <FileX className="size-3.5 shrink-0" />;
  }
  if (page.kind === "out-of-scope") {
    return <FileWarning className="size-3.5 shrink-0" />;
  }
  if (page.kind === "external") {
    return <ExternalLink className="size-3.5 shrink-0" />;
  }
  return <FileText className="size-3.5 shrink-0" />;
}

export function clampZoom(value: number): number {
  return Math.min(2, Math.max(0.5, Number(value.toFixed(2))));
}

export function visibleNavigablePages(
  pages: DeckPage[],
  expandedPages: Set<string>
): DeckPage[] {
  const result: DeckPage[] = [];

  const walk = (page: DeckPage) => {
    if (page.kind === "page") {
      result.push(page);
    }
    if (page.children.length > 0 && expandedPages.has(page.id)) {
      for (const child of page.children) {
        walk(child);
      }
    }
  };

  for (const page of pages) {
    walk(page);
  }
  return result;
}

export function pageMatchesSelection(
  page: DeckPage,
  selectedPath: string | null,
  selectedHash: string | null
): boolean {
  if (!selectedPath || page.path !== selectedPath) {
    return false;
  }

  const { hash } = splitHref(page.href);
  const pageHash = hash || "";
  const currentHash = selectedHash || "";
  if (pageHash || currentHash) {
    return pageHash === currentHash;
  }
  return true;
}

export function firstNavigablePagePath(deck: Deck | null): string | null {
  return deck?.pages.find((page) => page.kind === "page")?.path ?? null;
}

export function displayPageNumber(page: DeckPage, fallback: number): string {
  return page.tocNum ?? String(fallback);
}
