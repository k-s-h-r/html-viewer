import { describe, expect, it } from "vitest"

import { resolveDocumentBaseHref } from "./baseHref"

describe("resolveDocumentBaseHref", () => {
  it("reuses the last base href when undo reloads without options", () => {
    const initial = resolveDocumentBaseHref(null, {
      baseHref: "http://localhost:8765/pages/intro.html",
    })
    expect(initial.effective).toBe("http://localhost:8765/pages/intro.html")

    const undo = resolveDocumentBaseHref(initial.persisted)
    expect(undo.effective).toBe("http://localhost:8765/pages/intro.html")
  })

  it("clears the stored base href when a new document omits it", () => {
    const initial = resolveDocumentBaseHref(null, {
      baseHref: "http://localhost:8765/pages/intro.html",
    })
    const cleared = resolveDocumentBaseHref(initial.persisted, { baseHref: null })
    expect(cleared.persisted).toBeNull()
    expect(cleared.effective).toBeNull()
  })
})
