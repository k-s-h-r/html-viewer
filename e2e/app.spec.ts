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

type BrowserViewState = {
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

async function getBrowserViewState(electronApp: ElectronApplication): Promise<BrowserViewState> {
  return electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    const view = win?.getBrowserView();
    if (!view) {
      return { url: "", bounds: { width: 0, height: 0 } };
    }
    return {
      url: view.webContents.getURL(),
      bounds: view.getBounds()
    };
  });
}

async function expectUiIntact(window: Page, electronApp: ElectronApplication): Promise<void> {
  await expect(window.getByTestId("app-shell")).toBeVisible();
  await expect(window.getByTestId("toolbar")).toBeVisible();

  const view = await getBrowserViewState(electronApp);
  expect(view.bounds.width, "BrowserView width").toBeGreaterThan(100);
  expect(view.bounds.height, "BrowserView height").toBeGreaterThan(100);
  expect(view.url, "BrowserView URL").toMatch(/127\.0\.0\.1/);
}

async function getZoomFactors(electronApp: ElectronApplication): Promise<{
  renderer: number;
  browserView: number;
}> {
  return electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    const view = win?.getBrowserView();
    return {
      renderer: win?.webContents.getZoomFactor() ?? 1,
      browserView: view?.webContents.getZoomFactor() ?? 1
    };
  });
}

async function waitForBrowserViewUrl(
  electronApp: ElectronApplication,
  pattern: RegExp
): Promise<void> {
  await expect
    .poll(async () => (await getBrowserViewState(electronApp)).url, { timeout: 15_000 })
    .toMatch(pattern);
}

test.describe("HTML Viewer", () => {
  test("launches, lists pages, searches, toggles focus mode, and loads BrowserView", async () => {
    const { electronApp, window, userDataDir } = await launchApp();

    try {
      await expect(window).toHaveTitle("HTML仕様書ビューワー");
      await expect(window.getByTestId("app-shell")).toBeVisible();

      const pageRows = window.getByTestId("page-row");
      await expect(pageRows).toHaveCount(6);
      await expect(window.getByRole("button", { name: /概要/ })).toBeVisible();
      await expect(window.getByRole("button", { name: /セットアップ/ })).toBeVisible();

      await waitForBrowserViewUrl(electronApp, /intro\.html/i);
      await expectUiIntact(window, electronApp);

      await window.getByPlaceholder(/検索/).fill("検索");
      await expect(window.getByTestId("results-pane")).toBeVisible();
      await expect(window.getByTestId("result-page").first()).toBeVisible();
      await expect(window.getByTestId("results-total")).not.toHaveText("0 件");

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
      await waitForBrowserViewUrl(electronApp, /intro\.html/i);
      await expectUiIntact(window, electronApp);

      const historyButton = window.getByRole("button", { name: "最近使ったフォルダ" });
      await expect(historyButton).toBeEnabled();

      await historyButton.click();
      await expect(window.getByText("最近使ったフォルダ", { exact: true })).toBeVisible();
      await expect(window.getByRole("menuitem", { name: "basic" })).toBeVisible();
      await expectUiIntact(window, electronApp);

      await window.keyboard.press("Escape");
      await expect(window.getByRole("menuitem", { name: "basic" })).toBeHidden();
      await expectUiIntact(window, electronApp);

      await historyButton.click();
      await window.getByRole("menuitem", { name: "basic" }).click();

      await expect(window.getByTestId("page-row")).toHaveCount(6);
      await waitForBrowserViewUrl(electronApp, /intro\.html/i);
      await expectUiIntact(window, electronApp);
    } finally {
      await electronApp.close();
      await rm(userDataDir, { recursive: true, force: true });
    }
  });

  test("toolbar navigation and sidebar toggle keep the viewer visible", async () => {
    const { electronApp, window, userDataDir } = await launchApp();

    try {
      await waitForBrowserViewUrl(electronApp, /intro\.html/i);

      await window.getByRole("button", { name: /セットアップ/ }).click();
      await waitForBrowserViewUrl(electronApp, /setup\.html/i);
      await expectUiIntact(window, electronApp);

      await window.getByRole("button", { name: "次のページ" }).click();
      await waitForBrowserViewUrl(electronApp, /search\.html/i);
      await expectUiIntact(window, electronApp);

      await window.getByRole("button", { name: "前のページ" }).click();
      await waitForBrowserViewUrl(electronApp, /setup\.html/i);
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
      await waitForBrowserViewUrl(electronApp, /intro\.html/i);
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
      await waitForBrowserViewUrl(electronApp, /intro\.html/i);

      const searchInput = window.getByPlaceholder(/検索/);
      await searchInput.fill("検索");
      await expect(window.getByTestId("results-pane")).toBeVisible();
      await expectUiIntact(window, electronApp);

      await searchInput.fill("");
      await expect(window.getByTestId("results-pane")).toBeHidden();
      await expectUiIntact(window, electronApp);

      const searchPageRow = window
        .getByTestId("page-row")
        .filter({ has: window.getByRole("button", { name: /検索/ }) });
      await searchPageRow.getByRole("button", { name: "アンカーを表示" }).click();
      await searchPageRow.getByRole("button", { name: /検索: ページ内検索/ }).click();
      await waitForBrowserViewUrl(electronApp, /search\.html#in-page/i);
      await expectUiIntact(window, electronApp);
    } finally {
      await electronApp.close();
      await rm(userDataDir, { recursive: true, force: true });
    }
  });

  test("results pane scrolls when search hits overflow", async () => {
    const { electronApp, window, userDataDir } = await launchApp();

    try {
      await waitForBrowserViewUrl(electronApp, /intro\.html/i);

      await window.getByPlaceholder(/検索/).fill("仕様");
      await expect(window.getByTestId("results-pane")).toBeVisible();
      await expect(window.getByTestId("results-total")).not.toHaveText("0 件");

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

  test("zoom applies only to BrowserView, not the app chrome", async () => {
    const { electronApp, window, userDataDir } = await launchApp();

    try {
      await waitForBrowserViewUrl(electronApp, /intro\.html/i);

      const beforeZoom = await getZoomFactors(electronApp);
      expect(beforeZoom.renderer).toBe(1);
      expect(beforeZoom.browserView).toBe(1);

      await window.getByRole("button", { name: "拡大" }).click();
      await expect(window.getByRole("button", { name: "110%" })).toBeVisible();

      const afterZoom = await getZoomFactors(electronApp);
      expect(afterZoom.renderer).toBe(1);
      expect(afterZoom.browserView).toBeGreaterThan(1);
      await expectUiIntact(window, electronApp);
    } finally {
      await electronApp.close();
      await rm(userDataDir, { recursive: true, force: true });
    }
  });
});
