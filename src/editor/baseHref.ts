export function resolveDocumentBaseHref(
  persisted: string | null,
  options?: { baseHref?: string | null }
): { persisted: string | null; effective: string | null } {
  if (options && "baseHref" in options) {
    const next = options.baseHref ?? null
    return { persisted: next, effective: next }
  }
  return { persisted, effective: persisted }
}
