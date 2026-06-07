import { ExternalLink, FileText, FileWarning, FileX } from "lucide-react";
import type { Deck, DeckPage } from "../shared/types";

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
    return <FileX className="size-3.5" />;
  }
  if (page.kind === "out-of-scope") {
    return <FileWarning className="size-3.5" />;
  }
  if (page.kind === "external") {
    return <ExternalLink className="size-3.5" />;
  }
  return <FileText className="size-3.5" />;
}

export function clampZoom(value: number): number {
  return Math.min(2, Math.max(0.5, Number(value.toFixed(2))));
}

export function findPageIndex(deck: Deck | null, selectedPath: string | null): number {
  if (!deck || !selectedPath) {
    return -1;
  }
  return deck.pages.findIndex((page) => page.kind === "page" && page.path === selectedPath);
}
