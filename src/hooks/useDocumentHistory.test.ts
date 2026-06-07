import { describe, expect, it } from "vitest"
import { pushDocumentHistory } from "./useDocumentHistory"

describe("pushDocumentHistory", () => {
  it("keeps redo history when the current entry is committed again after undo", () => {
    const prev = {
      stack: ["initial", "first edit", "second edit"],
      index: 1,
    }

    const next = pushDocumentHistory(prev, "first edit")

    expect(next).toBe(prev)
    expect(next.stack).toEqual(["initial", "first edit", "second edit"])
    expect(next.index).toBe(1)
  })

  it("drops redo history only when a new edit is committed after undo", () => {
    const next = pushDocumentHistory(
      {
        stack: ["initial", "first edit", "second edit"],
        index: 1,
      },
      "branched edit"
    )

    expect(next.stack).toEqual(["initial", "first edit", "branched edit"])
    expect(next.index).toBe(2)
  })
})
