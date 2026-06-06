import { describe, expect, it } from "vitest";
import { highlightQueryInText } from "./searchSnippet";

describe("highlightQueryInText", () => {
  it("wraps the matched query in a mark element", () => {
    const result = highlightQueryInText("...仕様書全体を検索...", "検索", false);
    expect(result).toHaveLength(3);
    expect(result[1]).toMatchObject({ type: "mark", props: { children: "検索" } });
  });

  it("matches case-insensitively by default", () => {
    const result = highlightQueryInText("HTML Viewer", "html", false);
    expect(result[0]).toMatchObject({ type: "mark", props: { children: "HTML" } });
  });
});
