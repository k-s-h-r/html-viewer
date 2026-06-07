import { FileWarning, FileX } from "lucide-react";

type StatusBannersProps = {
  error: string | null;
  warning: string | null | undefined;
};

export function StatusBanners({ error, warning }: StatusBannersProps) {
  return (
    <>
      {error ? (
        <div className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <FileX className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
      {warning ? (
        <div className="flex items-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <FileWarning className="size-4 shrink-0" />
          <span>{warning}</span>
        </div>
      ) : null}
    </>
  );
}
