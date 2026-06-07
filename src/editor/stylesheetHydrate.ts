import { EDITOR_INJECTED_ATTR } from "./dom"
import { acquireProjectDirectory } from "./fileIo"
import {
  isHydratableRelativePath,
  readFileFromProject,
  type HydrateMediaContext,
} from "./mediaHydrate"

export type HydrateStylesheetContext = HydrateMediaContext

function stylesheetLinks(doc: Document): HTMLLinkElement[] {
  return Array.from(doc.querySelectorAll<HTMLLinkElement>("link[href]")).filter(
    (link) => link.relList.contains("stylesheet")
  )
}

export function isHydratableStylesheetHref(href: string): boolean {
  return isHydratableRelativePath(href)
}

export function documentHasHydratableStylesheets(doc: Document): boolean {
  return stylesheetLinks(doc).some((link) =>
    isHydratableStylesheetHref(link.getAttribute("href") ?? "")
  )
}

export function htmlHasHydratableStylesheets(html: string): boolean {
  if (typeof DOMParser === "undefined") return false
  const doc = new DOMParser().parseFromString(html, "text/html")
  return documentHasHydratableStylesheets(doc)
}

export async function hydrateExternalStylesheetsFromProject(
  doc: Document,
  projectDir: FileSystemDirectoryHandle,
  htmlFile: FileSystemFileHandle
): Promise<number> {
  let count = 0
  for (const link of stylesheetLinks(doc)) {
    const href = (link.getAttribute("href") ?? "").trim()
    if (!isHydratableStylesheetHref(href)) continue
    const file = await readFileFromProject(projectDir, htmlFile, href)
    if (!file) continue
    const css = await file.text()
    const style = doc.createElement("style")
    style.setAttribute(EDITOR_INJECTED_ATTR, "")
    style.setAttribute("data-spec-external-css-href", href)
    style.textContent = css
    link.after(style)
    count++
  }
  return count
}

/** 読み込み後にディスク上の相対パス CSS を iframe 内の一時 style へ復元する */
export async function hydrateExternalStylesheetsAfterDocumentLoad(
  doc: Document,
  context: HydrateStylesheetContext,
  onProjectDirGranted?: (dir: FileSystemDirectoryHandle) => void
): Promise<void> {
  const { htmlHandle } = context
  if (!htmlHandle || !documentHasHydratableStylesheets(doc)) return

  let projectDir = context.projectDirHandle
  if (!projectDir) {
    projectDir = await acquireProjectDirectory(htmlHandle, null)
    if (!projectDir) return
    onProjectDirGranted?.(projectDir)
  }

  await hydrateExternalStylesheetsFromProject(doc, projectDir, htmlHandle)
}
