const STORAGE_KEY = "html-viewer:sidebar-layout";

export const DEFAULT_SIDEBAR_SIZE = 20;
const MIN_SIDEBAR_SIZE = 15;
const MAX_SIDEBAR_SIZE = 45;

export type SidebarLayout = {
  sidebar: number;
};

function clampSidebarSize(size: number): number {
  return Math.min(MAX_SIDEBAR_SIZE, Math.max(MIN_SIDEBAR_SIZE, size));
}

export function readSidebarLayout(): SidebarLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { sidebar: DEFAULT_SIDEBAR_SIZE };
    }

    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "sidebar" in parsed &&
      typeof parsed.sidebar === "number" &&
      Number.isFinite(parsed.sidebar)
    ) {
      return { sidebar: clampSidebarSize(parsed.sidebar) };
    }
  } catch {
    // Ignore malformed storage values.
  }

  return { sidebar: DEFAULT_SIDEBAR_SIZE };
}

export function saveSidebarLayout(layout: SidebarLayout): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ sidebar: clampSidebarSize(layout.sidebar) })
  );
}

export function toPanelLayout(layout: SidebarLayout): Record<string, number> {
  const sidebar = clampSidebarSize(layout.sidebar);
  return {
    sidebar,
    viewer: 100 - sidebar
  };
}

export function resetSidebarLayout(): void {
  localStorage.removeItem(STORAGE_KEY);
}
