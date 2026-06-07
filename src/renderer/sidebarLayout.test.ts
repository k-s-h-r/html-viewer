import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readSidebarLayout, resetSidebarLayout, saveSidebarLayout, toPanelLayout } from "./sidebarLayout";

const STORAGE_KEY = "html-viewer:sidebar-layout";

function createStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    }
  };
}

describe("sidebarLayout", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorage());
  });

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    vi.unstubAllGlobals();
  });

  it("returns the default layout when nothing is stored", () => {
    expect(readSidebarLayout()).toEqual({ sidebar: 20 });
  });

  it("persists and restores sidebar size", () => {
    saveSidebarLayout({ sidebar: 25 });
    expect(readSidebarLayout()).toEqual({ sidebar: 25 });
  });

  it("clamps stored values to supported bounds", () => {
    saveSidebarLayout({ sidebar: 5 });
    expect(readSidebarLayout()).toEqual({ sidebar: 15 });

    saveSidebarLayout({ sidebar: 80 });
    expect(readSidebarLayout()).toEqual({ sidebar: 45 });
  });

  it("builds a two-panel layout map", () => {
    expect(toPanelLayout({ sidebar: 25 })).toEqual({
      sidebar: 25,
      viewer: 75
    });
  });

  it("clears stored layout on reset", () => {
    saveSidebarLayout({ sidebar: 35 });
    resetSidebarLayout();
    expect(readSidebarLayout()).toEqual({ sidebar: 20 });
  });
});
