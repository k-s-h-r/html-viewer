import { PanelRightClose, X } from "lucide-react";
import type { SearchResult } from "../../shared/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { HighlightedSnippet } from "../searchSnippet";

type ResultsPaneProps = {
  searchResult: SearchResult;
  submittedQuery: string;
  matchCase: boolean;
  onNavigateToSearchTarget: (pagePath: string) => void;
  onClose: () => void;
};

export function ResultsPane({
  searchResult,
  submittedQuery,
  matchCase,
  onNavigateToSearchTarget,
  onClose
}: ResultsPaneProps) {
  return (
    <aside
      data-testid="results-pane"
      className="flex min-h-0 w-80 shrink-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm"
    >
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <span className="text-sm font-semibold">検索結果</span>
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary" data-testid="results-total">
            {searchResult.totalHits} 件
          </Badge>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="検索結果を閉じる"
                  onClick={onClose}
                >
                  <PanelRightClose />
                </Button>
              }
            />
            <TooltipContent side="left">検索結果を閉じる</TooltipContent>
          </Tooltip>
        </div>
      </div>
      {searchResult.pages.length > 0 ? (
        <ScrollArea className="min-h-0 flex-1" data-testid="results-scroll">
          <div className="flex flex-col gap-1 p-2">
            {searchResult.pages.map((pageResult) => (
              <section
                key={pageResult.pageId}
                data-testid="result-page"
                className="flex flex-col gap-0.5"
              >
                <button
                  type="button"
                  onClick={() => void onNavigateToSearchTarget(pageResult.pagePath)}
                  className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-accent"
                >
                  <strong className="truncate text-sm font-medium">
                    {pageResult.pageTitle}
                  </strong>
                  <Badge variant="outline" className="shrink-0">
                    {pageResult.count}
                  </Badge>
                </button>
                {pageResult.hits.slice(0, 5).map((hit) => (
                  <div
                    key={hit.id}
                    className="ml-2 overflow-hidden rounded-md px-2.5 py-1.5 text-left text-xs text-muted-foreground"
                  >
                    <HighlightedSnippet
                      snippet={hit.snippet}
                      query={submittedQuery}
                      matchCase={matchCase}
                    />
                  </div>
                ))}
              </section>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
          <X className="size-5" />
          <span>一致するページはありません。</span>
        </div>
      )}
    </aside>
  );
}
