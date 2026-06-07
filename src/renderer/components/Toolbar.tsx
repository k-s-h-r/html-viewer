import type { RefObject } from "react";
import {
  CaseSensitive,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FolderOpen,
  History,
  Maximize2,
  Minus,
  PanelLeft,
  PanelRight,
  PencilLine,
  Plus,
  Search,
  X
} from "lucide-react";
import type { Deck, RecentFolder } from "../../shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type ToolbarProps = {
  deck: Deck | null;
  recentFolders: RecentFolder[];
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  matchCase: boolean;
  findCounter: string | null;
  showResults: boolean;
  selectedPageNumber: number;
  navigablePageCount: number;
  zoom: number;
  sidebarVisible: boolean;
  resultsPaneVisible: boolean;
  onOpenFolder: () => void;
  onOpenRecentFolder: (folderPath: string) => void;
  onOpenEditor: () => void;
  onSearchQueryChange: (value: string) => void;
  onClearSearch: () => void;
  onMatchCaseToggle: () => void;
  onExecuteSearch: () => void;
  onNavigateSearchAcrossPages: (forward: boolean) => void;
  onNavigateByOffset: (offset: number) => void;
  onSetZoomFactor: (zoom: number) => void;
  onSidebarVisibleToggle: () => void;
  onResultsPaneVisibleToggle: () => void;
  onFocusModeEnable: () => void;
};

export function Toolbar({
  deck,
  recentFolders,
  searchInputRef,
  searchQuery,
  matchCase,
  findCounter,
  showResults,
  selectedPageNumber,
  navigablePageCount,
  zoom,
  sidebarVisible,
  resultsPaneVisible,
  onOpenFolder,
  onOpenRecentFolder,
  onOpenEditor,
  onSearchQueryChange,
  onClearSearch,
  onMatchCaseToggle,
  onExecuteSearch,
  onNavigateSearchAcrossPages,
  onNavigateByOffset,
  onSetZoomFactor,
  onSidebarVisibleToggle,
  onResultsPaneVisibleToggle,
  onFocusModeEnable
}: ToolbarProps) {
  return (
    <header
      data-testid="toolbar"
      className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3"
    >
      <div className="flex items-center gap-1.5">
        <Button size="sm" onClick={onOpenFolder}>
          <FolderOpen />
          フォルダを開く
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="icon-sm"
                disabled={recentFolders.length === 0}
                aria-label="最近使ったフォルダ"
              >
                <History />
              </Button>
            }
          />
          <DropdownMenuContent align="center" side="top" className="w-64">
            <DropdownMenuGroup>
              <DropdownMenuLabel>最近使ったフォルダ</DropdownMenuLabel>
              {recentFolders.map((folder) => (
                <DropdownMenuItem
                  key={folder.path}
                  onClick={() => void onOpenRecentFolder(folder.path)}
                >
                  <FolderOpen className="text-muted-foreground" />
                  <span className="truncate">{folder.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Separator orientation="vertical" className="mx-1 h-6 my-auto" />

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={!deck}
              aria-label="現在ページを編集"
              onClick={onOpenEditor}
            >
              <PencilLine />
            </Button>
          }
        />
        <TooltipContent side="top">現在ページを編集</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="mx-1 h-6 my-auto" />

      <div className="flex min-w-[320px] flex-1 items-center gap-1.5">
        <div
          className={cn(
            "flex h-8 min-w-0 flex-1 items-center rounded-lg border border-input bg-transparent dark:bg-input/30",
            "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
          )}
        >
          <Search className="pointer-events-none ml-2.5 size-4 shrink-0 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            className="h-full min-h-0 flex-1 border-0 bg-transparent px-2 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
            placeholder="検索...  (Ctrl+F)"
            value={searchQuery}
            onChange={(event) => {
              const value = event.currentTarget.value;
              onSearchQueryChange(value);
              if (!value.trim()) {
                onClearSearch();
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (showResults) {
                  onNavigateSearchAcrossPages(!event.shiftKey);
                } else {
                  onExecuteSearch();
                }
              }
            }}
          />
          <div className="flex shrink-0 items-center gap-0.5 pr-1">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant={matchCase ? "secondary" : "ghost"}
                    size="icon-xs"
                    aria-pressed={matchCase}
                    aria-label="大文字小文字を区別"
                    className={cn(
                      "text-muted-foreground",
                      matchCase && "text-foreground"
                    )}
                    onClick={onMatchCaseToggle}
                  >
                    <CaseSensitive />
                  </Button>
                }
              />
              <TooltipContent side="top">大文字小文字を区別</TooltipContent>
            </Tooltip>
            {searchQuery.trim() ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="検索をクリア"
                className="text-muted-foreground"
                onClick={onClearSearch}
              >
                <X />
              </Button>
            ) : null}
            {findCounter ? (
              <span
                data-testid="find-counter"
                className="px-1 text-xs tabular-nums text-muted-foreground"
              >
                {findCounter}
              </span>
            ) : null}
          </div>
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="検索"
                disabled={!searchQuery.trim()}
                onClick={onExecuteSearch}
              >
                <Search />
              </Button>
            }
          />
          <TooltipContent side="top">検索 (Enter)</TooltipContent>
        </Tooltip>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!showResults}
          aria-label="前のヒット"
          onClick={() => onNavigateSearchAcrossPages(false)}
        >
          <ChevronUp />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!showResults}
          aria-label="次のヒット"
          onClick={() => onNavigateSearchAcrossPages(true)}
        >
          <ChevronDown />
        </Button>
      </div>

      <Separator orientation="vertical" className="mx-1 h-6 my-auto" />

      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!deck}
          aria-label="前のページ"
          onClick={() => onNavigateByOffset(-1)}
        >
          <ChevronLeft />
        </Button>
        <span className="min-w-[64px] text-center text-sm tabular-nums text-muted-foreground">
          {selectedPageNumber || "-"} / {navigablePageCount || "-"}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!deck}
          aria-label="次のページ"
          onClick={() => onNavigateByOffset(1)}
        >
          <ChevronRight />
        </Button>

        <Separator orientation="vertical" className="mx-1 h-6 my-auto" />

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="縮小"
          onClick={() => void onSetZoomFactor(zoom - 0.1)}
        >
          <Minus />
        </Button>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="min-w-[52px] tabular-nums"
                onClick={() => void onSetZoomFactor(1)}
              >
                {Math.round(zoom * 100)}%
              </Button>
            }
          />
          <TooltipContent side="top">100%に戻す</TooltipContent>
        </Tooltip>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="拡大"
          onClick={() => void onSetZoomFactor(zoom + 0.1)}
        >
          <Plus />
        </Button>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={sidebarVisible ? "secondary" : "ghost"}
                size="icon-sm"
                aria-pressed={sidebarVisible}
                aria-label="サイドバー"
                onClick={onSidebarVisibleToggle}
              >
                <PanelLeft />
              </Button>
            }
          />
          <TooltipContent side="top">サイドバー</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={resultsPaneVisible ? "secondary" : "ghost"}
                size="icon-sm"
                aria-pressed={resultsPaneVisible}
                aria-label="検索結果"
                disabled={!showResults}
                onClick={onResultsPaneVisibleToggle}
              >
                <PanelRight />
              </Button>
            }
          />
          <TooltipContent side="top">検索結果</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="集中モード"
                onClick={onFocusModeEnable}
              >
                <Maximize2 />
              </Button>
            }
          />
          <TooltipContent side="top">集中モード</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
