import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page
} from "@playwright/test";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sampleDeck = path.join(rootDir, "sample-decks/basic");
const appEntry = path.join(rootDir, "dist-electron/main/index.js");

type DocumentViewState = {
  url: string;
  bounds: { width: number; height: number };
};

async function launchApp(options?: {
  userDataDir?: string;
  openFolder?: string;
}): Promise<{ electronApp: ElectronApplication; window: Page; userDataDir: string }> {
  const userDataDir =
    options?.userDataDir ?? (await mkdtemp(path.join(tmpdir(), "html-viewer-e2e-")));

  const electronApp = await electron.launch({
    args: [appEntry, `--user-data-dir=${userDataDir}`],
    cwd: rootDir,
    env: {
      ...process.env,
      HTML_VIEWER_OPEN_FOLDER: options?.openFolder ?? sampleDeck
    }
  });

  const window = await electronApp.firstWindow();
  await window.waitForLoadState("domcontentloaded");

  return { electronApp, window, userDataDir };
}

async function getDocumentViewState(electronApp: ElectronApplication): Promise<DocumentViewState> {
  return electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) {
      return { url: "", bounds: { width: 0, height: 0 } };
    }

    for (const child of win.contentView.children) {
      if (!("webContents" in child) || typeof child.webContents?.getURL !== "function") {
        continue;
      }
      const url = child.webContents.getURL();
      if (/127\.0\.0\.1/.test(url)) {
        return {
          url,
          bounds: child.getBounds()
        };
      }
    }

    return { url: "", bounds: { width: 0, height: 0 } };
  });
}

async function expectUiIntact(window: Page, electronApp: ElectronApplication): Promise<void> {
  await expect(window.getByTestId("app-shell")).toBeVisible();
  await expect(window.getByTestId("toolbar")).toBeVisible();

  const view = await getDocumentViewState(electronApp);
  expect(view.bounds.width, "document WebContentsView width").toBeGreaterThan(100);
  expect(view.bounds.height, "document WebContentsView height").toBeGreaterThan(100);
  expect(view.url, "document WebContentsView URL").toMatch(/127\.0\.0\.1/);
}

async function getZoomFactors(electronApp: ElectronApplication): Promise<{
  renderer: number;
  documentView: number;
}> {
  return electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) {
      return { renderer: 1, documentView: 1 };
    }

    let documentViewZoom = 1;
    for (const child of win.contentView.children) {
      if (!("webContents" in child) || typeof child.webContents?.getURL !== "function") {
        continue;
      }
      if (/127\.0\.0\.1/.test(child.webContents.getURL())) {
        documentViewZoom = child.webContents.getZoomFactor();
        break;
      }
    }

    return {
      renderer: win.webContents.getZoomFactor(),
      documentView: documentViewZoom
    };
  });
}

async function expectSelectedPageFocused(window: Page): Promise<void> {
  await expect
    .poll(async () => {
      const button = window.getByTestId("selected-page-button");
      await button.focus();
      return button.evaluate((element) => element === document.activeElement);
    })
    .toBe(true);
}

async function waitForDocumentViewUrl(
  electronApp: ElectronApplication,
  pattern: RegExp
): Promise<void> {
  await expect
    .poll(async () => (await getDocumentViewState(electronApp)).url, { timeout: 15_000 })
    .toMatch(pattern);
}

async function isDocumentViewFocused(electronApp: ElectronApplication): Promise<boolean> {
  return electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) {
      return false;
    }

    for (const child of win.contentView.children) {
      if (!("webContents" in child) || typeof child.webContents?.getURL !== "function") {
        continue;
      }
      if (/127\.0\.0\.1/.test(child.webContents.getURL())) {
        return child.webContents.isFocused();
      }
    }

    return false;
  });
}

async function pressDocumentViewKey(
  electronApp: ElectronApplication,
  keyCode: string
): Promise<void> {
  await electronApp.evaluate(({ BrowserWindow }, code) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) {
      return;
    }

    for (const child of win.contentView.children) {
      if (!("webContents" in child) || typeof child.webContents?.getURL !== "function") {
        continue;
      }
      if (/127\.0\.0\.1/.test(child.webContents.getURL())) {
        child.webContents.focus();
        child.webContents.sendInputEvent({ type: "keyDown", keyCode: code });
        child.webContents.sendInputEvent({ type: "keyUp", keyCode: code });
        return;
      }
    }
  }, keyCode);
}

async function focusDocumentView(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) {
      return;
    }

    for (const child of win.contentView.children) {
      if (!("webContents" in child) || typeof child.webContents?.getURL !== "function") {
        continue;
      }
      if (/127\.0\.0\.1/.test(child.webContents.getURL())) {
        child.webContents.focus();
      }
    }
  });
}

async function triggerFocusSearch(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(({ BrowserWindow, Menu }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) {
      return;
    }

    const findMenuItem = (menu: Electron.Menu): Electron.MenuItem | null => {
      for (const item of menu.items) {
        if (item.label === "検索...") {
          return item;
        }
        if (item.submenu) {
          const nested = findMenuItem(item.submenu);
          if (nested) {
            return nested;
          }
        }
      }
      return null;
    };

    const menuItem = Menu.getApplicationMenu()
      ? findMenuItem(Menu.getApplicationMenu()!)
      : null;
    menuItem?.click({}, win, win.webContents);
  });
}

test.describe("HTML Viewer", () => {
  test("launches, lists pages, searches, toggles focus mode, and loads BrowserView", async () => {
    const { electronApp, window, userDataDir } = await launchApp();

    try {
      await expect(window).toHaveTitle("HTML仕様書ビューワー");
      await expect(window.getByTestId("app-shell")).toBeVisible();

      const pageRows = window.getByTestId("page-row");
      await expect(pageRows).toHaveCount(7);
      await expect(window.getByRole("button", { name: /概要/ })).toBeVisible();
      await expect(window.getByRole("button", { name: /セットアップ/ })).toBeVisible();

      await waitForDocumentViewUrl(electronApp, /intro\.html/i);
      await expectUiIntact(window, electronApp);

      const searchInput = window.getByPlaceholder(/検索/);
      await searchInput.fill("検索");
      await searchInput.press("Enter");
      await expect(window.getByTestId("results-pane")).toBeVisible();
      await expect(window.getByTestId("result-page").first()).toBeVisible();
      await expect(window.getByTestId("results-total")).not.toHaveText("0 件");
      await expect(window.getByTestId("find-counter")).toHaveText(/^1\/\d+$/);

      await searchInput.press("Enter");
      await expect(window.getByTestId("find-counter")).toHaveText(/^2\/\d+$/);

      await window.getByTestId("result-page").first().getByRole("button").click();
      await expect(window.getByTestId("find-counter")).toHaveText(/^1\/\d+$/);

      await window.getByRole("button", { name: "集中モード", exact: true }).click();
      await expect(window.getByTestId("app-shell")).toHaveAttribute("data-focus-mode", "true");
      await expect(window.getByTestId("toolbar")).toBeHidden();

      await window.keyboard.press("Escape");
      await expect(window.getByTestId("app-shell")).toHaveAttribute("data-focus-mode", "false");
      await expect(window.getByTestId("toolbar")).toBeVisible();
    } finally {
      await electronApp.close();
      await rm(userDataDir, { recursive: true, force: true });
    }
  });

  test("history dropdown keeps the UI and BrowserView visible", async () => {
    const { electronApp, window, userDataDir } = await launchApp();

    try {
      await waitForDocumentViewUrl(electronApp, /intro\.html/i);
      await expectUiIntact(window, electronApp);

      const historyButton = window.getByRole("button", { name: "最近使ったフォルダ" });
      await expect(historyButton).toBeEnabled();

      await historyButton.click();
      await expect(window.getByText("最近使ったフォルダ", { exact: true })).toBeVisible();
      await expect(window.getByRole("menuitem", { name: "basic" })).toBeVisible();
      await expect(window.getByTestId("app-shell")).toBeVisible();
      await expect(window.getByTestId("toolbar")).toBeVisible();

      await window.keyboard.press("Escape");
      await expect(window.getByRole("menuitem", { name: "basic" })).toBeHidden();
      await expectUiIntact(window, electronApp);

      await historyButton.click();
      await window.getByRole("menuitem", { name: "basic" }).click();

      await expect(window.getByTestId("page-row")).toHaveCount(7);
      await waitForDocumentViewUrl(electronApp, /intro\.html/i);
      await expectUiIntact(window, electronApp);
    } finally {
      await electronApp.close();
      await rm(userDataDir, { recursive: true, force: true });
    }
  });

  test("sidebar Enter and document Escape move focus between panes", async () => {
    const { electronApp, window, userDataDir } = await launchApp();

    try {
      await waitForDocumentViewUrl(electronApp, /intro\.html/i);

      const selectedPageButton = window.getByTestId("selected-page-button");
      await selectedPageButton.focus();
      await expect(selectedPageButton).toBeFocused();

      await window.keyboard.press("Enter");
      await expect
        .poll(async () => isDocumentViewFocused(electronApp), { timeout: 5_000 })
        .toBe(true);

      await pressDocumentViewKey(electronApp, "Escape");
      await expect
        .poll(async () => isDocumentViewFocused(electronApp), { timeout: 5_000 })
        .toBe(false);
      await expect(selectedPageButton).toBeFocused();

      await window.keyboard.press("ArrowDown");
      await waitForDocumentViewUrl(electronApp, /setup\.html/i);
      await expectUiIntact(window, electronApp);
    } finally {
      await electronApp.close();
      await rm(userDataDir, { recursive: true, force: true });
    }
  });

  test("sidebar arrow keys navigate pages while keeping sidebar focus", async () => {
    const { electronApp, window, userDataDir } = await launchApp();

    try {
      await waitForDocumentViewUrl(electronApp, /intro\.html/i);

      const setupButton = window.getByRole("button", { name: /セットアップ/ });
      await setupButton.click();
      await waitForDocumentViewUrl(electronApp, /setup\.html/i);
      await expectSelectedPageFocused(window);

      await window.keyboard.press("ArrowDown");
      await waitForDocumentViewUrl(electronApp, /search\.html(?!#)/i);
      await expectSelectedPageFocused(window);
      await expect(window.getByTestId("selected-page-button")).toHaveAttribute(
        "data-page-id",
        "chapters/search.html::3"
      );
      await expectUiIntact(window, electronApp);

      await window.keyboard.press("ArrowUp");
      await waitForDocumentViewUrl(electronApp, /setup\.html(?!#)/i);
      await expectSelectedPageFocused(window);
      await expect(window.getByTestId("selected-page-button")).toHaveAttribute(
        "data-page-id",
        "chapters/setup.html::2"
      );
      await expectUiIntact(window, electronApp);
    } finally {
      await electronApp.close();
      await rm(userDataDir, { recursive: true, force: true });
    }
  });

  test("toolbar navigation and sidebar toggle keep the viewer visible", async () => {
    const { electronApp, window, userDataDir } = await launchApp();

    try {
      await waitForDocumentViewUrl(electronApp, /intro\.html/i);

      await window.getByRole("button", { name: /セットアップ/ }).click();
      await waitForDocumentViewUrl(electronApp, /setup\.html/i);
      await expectUiIntact(window, electronApp);

      await window.getByRole("button", { name: "次のページ" }).click();
      await waitForDocumentViewUrl(electronApp, /search\.html(?!#)/i);
      await expectUiIntact(window, electronApp);

      await window.getByRole("button", { name: "前のページ" }).click();
      await waitForDocumentViewUrl(electronApp, /setup\.html(?!#)/i);
      await expectUiIntact(window, electronApp);

      const sidebarButton = window.getByRole("button", { name: "サイドバー" });
      await sidebarButton.click();
      await expect(window.getByTestId("page-row")).toBeHidden();
      await expectUiIntact(window, electronApp);

      await sidebarButton.click();
      await expect(window.getByTestId("page-row").first()).toBeVisible();
      await expectUiIntact(window, electronApp);
    } finally {
      await electronApp.close();
      await rm(userDataDir, { recursive: true, force: true });
    }
  });

  test("zoom controls update percentage without breaking the viewer", async () => {
    const { electronApp, window, userDataDir } = await launchApp();

    try {
      await waitForDocumentViewUrl(electronApp, /intro\.html/i);
      await expectUiIntact(window, electronApp);

      await expect(window.getByRole("button", { name: "100%" })).toBeVisible();

      await window.getByRole("button", { name: "拡大" }).click();
      await expect(window.getByRole("button", { name: "110%" })).toBeVisible();
      await expectUiIntact(window, electronApp);

      await window.getByRole("button", { name: "110%" }).click();
      await expect(window.getByRole("button", { name: "100%" })).toBeVisible();
      await expectUiIntact(window, electronApp);

      await window.getByRole("button", { name: "縮小" }).click();
      await expect(window.getByRole("button", { name: "90%" })).toBeVisible();
      await expectUiIntact(window, electronApp);
    } finally {
      await electronApp.close();
      await rm(userDataDir, { recursive: true, force: true });
    }
  });

  test("search can be cleared and anchor navigation keeps the UI intact", async () => {
    const { electronApp, window, userDataDir } = await launchApp();

    try {
      await waitForDocumentViewUrl(electronApp, /intro\.html/i);

      const searchInput = window.getByPlaceholder(/検索/);
      await searchInput.fill("検索");
      await searchInput.press("Enter");
      await expect(window.getByTestId("results-pane")).toBeVisible();
      await expectUiIntact(window, electronApp);

      await searchInput.fill("");
      await expect(window.getByTestId("results-pane")).toBeHidden();
      await expectUiIntact(window, electronApp);

      await window.getByRole("button", { name: /全ページカタログ/ }).click();
      await waitForDocumentViewUrl(electronApp, /search\.html#catalog/i);
      await expectUiIntact(window, electronApp);
    } finally {
      await electronApp.close();
      await rm(userDataDir, { recursive: true, force: true });
    }
  });

  test("results pane scrolls when search hits overflow", async () => {
    const { electronApp, window, userDataDir } = await launchApp();

    try {
      await waitForDocumentViewUrl(electronApp, /intro\.html/i);

      await window.getByPlaceholder(/検索/).fill("仕様");
      await window.getByPlaceholder(/検索/).press("Enter");
      await expect(window.getByTestId("results-pane")).toBeVisible();
      await expect(window.getByTestId("results-total")).not.toHaveText("0 件");

      await window.getByTestId("results-scroll").evaluate((root) => {
        const viewport = root.querySelector('[data-slot="scroll-area-viewport"]');
        if (viewport instanceof HTMLElement) {
          viewport.style.height = "120px";
          viewport.style.maxHeight = "120px";
        }
      });

      const scrollMetrics = await window.getByTestId("results-scroll").evaluate((root) => {
        const viewport = root.querySelector('[data-slot="scroll-area-viewport"]');
        if (!(viewport instanceof HTMLElement)) {
          return { scrollHeight: 0, clientHeight: 0 };
        }
        return { scrollHeight: viewport.scrollHeight, clientHeight: viewport.clientHeight };
      });

      expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);

      const scrollTopBefore = await window.getByTestId("results-scroll").evaluate((root) => {
        const viewport = root.querySelector('[data-slot="scroll-area-viewport"]');
        return viewport instanceof HTMLElement ? viewport.scrollTop : 0;
      });

      await window.getByTestId("results-scroll").evaluate((root) => {
        const viewport = root.querySelector('[data-slot="scroll-area-viewport"]');
        if (viewport instanceof HTMLElement) {
          viewport.scrollTop = viewport.scrollHeight;
        }
      });

      const scrollTopAfter = await window.getByTestId("results-scroll").evaluate((root) => {
        const viewport = root.querySelector('[data-slot="scroll-area-viewport"]');
        return viewport instanceof HTMLElement ? viewport.scrollTop : 0;
      });

      expect(scrollTopAfter).toBeGreaterThan(scrollTopBefore);
      await expectUiIntact(window, electronApp);
    } finally {
      await electronApp.close();
      await rm(userDataDir, { recursive: true, force: true });
    }
  });

  test("history dropdown stays visible while BrowserView remains loaded", async () => {
    const { electronApp, window, userDataDir } = await launchApp();

    try {
      await waitForDocumentViewUrl(electronApp, /intro\.html/i);

      const historyButton = window.getByRole("button", { name: "最近使ったフォルダ" });
      await historyButton.click();
      await expect(window.getByRole("menuitem", { name: "basic" })).toBeVisible();
      await expectUiIntact(window, electronApp);

      await window.keyboard.press("Escape");
      await expect(window.getByRole("menuitem", { name: "basic" })).toBeHidden();
      await expectUiIntact(window, electronApp);
    } finally {
      await electronApp.close();
      await rm(userDataDir, { recursive: true, force: true });
    }
  });

  test("focus search from document view accepts keyboard input", async () => {
    const { electronApp, window, userDataDir } = await launchApp();

    try {
      await waitForDocumentViewUrl(electronApp, /intro\.html/i);
      await focusDocumentView(electronApp);
      await triggerFocusSearch(electronApp);

      const searchInput = window.getByPlaceholder(/検索/);
      await expect(searchInput).toBeFocused();
      await window.keyboard.type("hello");

      await expect(searchInput).toHaveValue("hello");
      await expectUiIntact(window, electronApp);
    } finally {
      await electronApp.close();
      await rm(userDataDir, { recursive: true, force: true });
    }
  });

  test("zoom applies only to BrowserView, not the app chrome", async () => {
    const { electronApp, window, userDataDir } = await launchApp();

    try {
      await waitForDocumentViewUrl(electronApp, /intro\.html/i);

      const beforeZoom = await getZoomFactors(electronApp);
      expect(beforeZoom.renderer).toBe(1);
      expect(beforeZoom.documentView).toBe(1);

      await window.getByRole("button", { name: "拡大" }).click();
      await expect(window.getByRole("button", { name: "110%" })).toBeVisible();

      const afterZoom = await getZoomFactors(electronApp);
      expect(afterZoom.renderer).toBe(1);
      expect(afterZoom.documentView).toBeGreaterThan(1);
      await expectUiIntact(window, electronApp);
    } finally {
      await electronApp.close();
      await rm(userDataDir, { recursive: true, force: true });
    }
  });
});
