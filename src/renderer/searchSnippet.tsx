import type { ReactNode } from "react";

export function highlightQueryInText(
  text: string,
  query: string,
  matchCase: boolean
): ReactNode[] {
  if (!query.trim()) {
    return [text];
  }

  const source = matchCase ? text : text.toLocaleLowerCase();
  const needle = matchCase ? query : query.toLocaleLowerCase();
  const index = source.indexOf(needle);
  if (index < 0) {
    return [text];
  }

  const parts: ReactNode[] = [];
  if (index > 0) {
    parts.push(text.slice(0, index));
  }

  parts.push(
    <mark
      key="match"
      className="rounded-sm bg-yellow-200 px-0.5 text-foreground dark:bg-yellow-500/30"
    >
      {text.slice(index, index + query.length)}
    </mark>
  );

  if (index + query.length < text.length) {
    parts.push(text.slice(index + query.length));
  }

  return parts;
}
