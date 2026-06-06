import path from "node:path";
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

async function launchApp(): Promise<{ electronApp: ElectronApplication; window: Page }> {
  const electronApp = await electron.launch({
    args: [appEntry],
    cwd: rootDir,
    env: {
      ...process.env,
      HTML_VIEWER_OPEN_FOLDER: sampleDeck
    }
  });

  const window = await electronApp.firstWindow();
  await window.waitForLoadState("domcontentloaded");

  return { electronApp, window };
}

async function getBrowserViewUrl(electronApp: ElectronApplication): Promise<string> {
  return electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    const view = win?.getBrowserView();
    return view?.webContents.getURL() ?? "";
  });
}

test.describe("HTML Viewer", () => {
  test("launches, lists pages, searches, toggles focus mode, and loads BrowserView", async () => {
    const { electronApp, window } = await launchApp();

    try {
      await expect(window).toHaveTitle("HTML仕様書ビューワー");
      await expect(window.locator(".app-shell")).toBeVisible();

      const pageRows = window.locator(".page-list .page-row");
      await expect(pageRows).toHaveCount(6);
      await expect(window.getByRole("button", { name: /概要/ })).toBeVisible();
      await expect(window.getByRole("button", { name: /セットアップ/ })).toBeVisible();

      await expect
        .poll(async () => getBrowserViewUrl(electronApp), { timeout: 15_000 })
        .toMatch(/intro\.html/i);

      await window.locator(".search-input").fill("検索");
      await expect(window.locator(".results-pane")).toBeVisible();
      await expect(window.locator(".result-list .result-page").first()).toBeVisible();
      await expect(window.locator(".results-pane small")).not.toHaveText("0 件");

      await window.getByRole("button", { name: "集中", exact: true }).click();
      await expect(window.locator(".app-shell")).toHaveClass(/is-focus-mode/);
      await expect(window.locator(".toolbar")).toBeHidden();

      await window.keyboard.press("Escape");
      await expect(window.locator(".app-shell")).not.toHaveClass(/is-focus-mode/);
      await expect(window.locator(".toolbar")).toBeVisible();
    } finally {
      await electronApp.close();
    }
  });
});
