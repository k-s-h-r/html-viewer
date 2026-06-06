import { useMemo } from "react";

const SNIPPET_MAX_BODY = 38;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fitSnippetToLines(snippet: string, query: string, matchCase: boolean): string {
  if (!query || snippet.length <= SNIPPET_MAX_BODY + 6) {
    return snippet;
  }

  const leadingEllipsis = snippet.startsWith("...") ? 3 : 0;
  const core = leadingEllipsis ? snippet.slice(3) : snippet;
  const haystack = matchCase ? core : core.toLocaleLowerCase();
  const needle = matchCase ? query : query.toLocaleLowerCase();
  const matchIndex = haystack.indexOf(needle);

  if (matchIndex < 0) {
    return snippet.slice(0, SNIPPET_MAX_BODY + leadingEllipsis) + "...";
  }

  const matchEnd = matchIndex + query.length;
  const budget = Math.max(SNIPPET_MAX_BODY, query.length + 8);
  const maxBefore = 10;

  let start = Math.max(0, matchIndex - maxBefore);
  let end = Math.min(core.length, start + budget);

  if (matchEnd > end) {
    end = matchEnd;
    start = Math.max(0, end - budget);
  }

  if (matchIndex < start) {
    start = matchIndex;
    end = Math.min(core.length, start + budget);
  }

  const prefix = leadingEllipsis || start > 0 ? "..." : "";
  const suffix = end < core.length ? "..." : "";
  return `${prefix}${core.slice(start, end)}${suffix}`;
}

export function HighlightedSnippet({
  snippet,
  query,
  matchCase
}: {
  snippet: string;
  query: string;
  matchCase: boolean;
}) {
  const displaySnippet = useMemo(
    () => fitSnippetToLines(snippet, query, matchCase),
    [snippet, query, matchCase]
  );

  const parts = useMemo(() => {
    if (!query) {
      return [{ text: displaySnippet, highlight: false }];
    }

    const pattern = new RegExp(escapeRegExp(query), matchCase ? "g" : "gi");
    const segments: Array<{ text: string; highlight: boolean }> = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(displaySnippet)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ text: displaySnippet.slice(lastIndex, match.index), highlight: false });
      }
      segments.push({ text: match[0], highlight: true });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < displaySnippet.length) {
      segments.push({ text: displaySnippet.slice(lastIndex), highlight: false });
    }

    return segments.length > 0 ? segments : [{ text: displaySnippet, highlight: false }];
  }, [displaySnippet, query, matchCase]);

  return (
    <span className="line-clamp-2 overflow-hidden leading-snug">
      {parts.map((part, index) =>
        part.highlight ? (
          <mark
            key={index}
            className="rounded-sm bg-primary/20 font-medium text-foreground"
          >
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        )
      )}
    </span>
  );
}
