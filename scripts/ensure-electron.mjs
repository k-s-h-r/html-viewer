import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

function platformExecutablePath() {
  if (process.platform === "darwin") {
    return "Electron.app/Contents/MacOS/Electron";
  }
  if (process.platform === "win32") {
    return "electron.exe";
  }
  return "electron";
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function extractZip(zipPath, distDir) {
  await fs.rm(distDir, { recursive: true, force: true });
  await fs.mkdir(distDir, { recursive: true });

  if (process.platform === "darwin") {
    await run("ditto", ["-x", "-k", zipPath, distDir]);
    return;
  }

  const extract = require("extract-zip");
  await extract(zipPath, { dir: distDir });
}

export async function ensureElectron() {
  const electronPackagePath = require.resolve("electron/package.json");
  const electronDir = path.dirname(electronPackagePath);
  const executablePath = platformExecutablePath();
  const distDir = path.join(electronDir, "dist");
  const pathFile = path.join(electronDir, "path.txt");
  const executable = path.join(distDir, executablePath);

  if (existsSync(pathFile) && existsSync(executable)) {
    return executable;
  }

  const { downloadArtifact } = require("@electron/get");
  const { version } = require(electronPackagePath);
  const checksums = require(path.join(electronDir, "checksums.json"));
  const zipPath = await downloadArtifact({
    version,
    artifactName: "electron",
    platform: process.platform,
    arch: process.arch,
    checksums
  });

  await extractZip(zipPath, distDir);
  await fs.writeFile(pathFile, executablePath);

  return executable;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  ensureElectron()
    .then((electronPath) => {
      console.log(`Electron ready: ${electronPath}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
