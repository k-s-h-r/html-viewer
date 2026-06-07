import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerZIP } from "@electron-forge/maker-zip";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { FuseV1Options, FuseVersion } from "@electron/fuses";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const appIcon = path.join(rootDir, "assets", "icon", "icon");

const config: ForgeConfig = {
  outDir: "release",
  packagerConfig: {
    asar: true,
    appBundleId: "dev.html-viewer.app",
    name: "HTML Viewer",
    icon: appIcon,
    appCategoryType: "public.app-category.productivity",
    ignore: [
      /^\/src($|\/)/,
      /^\/\.vscode($|\/)/,
      /^\/\.agents($|\/)/,
      /^\/e2e($|\/)/,
      /^\/docs($|\/)/,
      /^\/scripts($|\/)/,
      /^\/sample-decks($|\/)/,
      /^\/release($|\/)/,
      /^\/out($|\/)/,
      /^\/test-results($|\/)/,
      /^\/playwright-report($|\/)/,
      /^\/node_modules\/\.vite($|\/)/,
      /^\/\.git($|\/)/,
      /forge\.config\.ts$/,
      /vite\.config\.ts$/,
      /tsconfig(\..*)?\.json$/,
      /eslint\.config\./,
      /playwright\.config\./,
      /vitest\.config\./,
      /components\.json$/,
      /^\/index\.html$/,
      /^\/editor\.html$/,
      /\.vscodeignore$/,
      /README\.md$/,
      /icon-html-viewer\.svg$/
    ]
  },
  rebuildConfig: {},
  makers: [
    new MakerDMG({
      format: "ULFO",
      icon: `${appIcon}.icns`
    }),
    new MakerZIP({}, ["darwin", "win32", "linux"]),
    new MakerDeb(
      {
        options: {
          icon: `${appIcon}.png`
        }
      },
      ["linux"]
    )
  ],
  plugins: [
    {
      name: "@electron-forge/plugin-auto-unpack-natives",
      config: {}
    },
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true
    })
  ],
  hooks: {
    prePackage: async () => {
      execSync("node scripts/generate-icons.mjs", { stdio: "inherit" });
      execSync("npm run build", { stdio: "inherit" });
    }
  }
};

export default config;
