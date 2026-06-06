import { spawn } from "node:child_process";
import path from "node:path";
import { ensureElectron } from "./ensure-electron.mjs";

const rootDir = process.cwd();
const sampleDeck = path.join(rootDir, "sample-decks/basic");
const appEntry = path.join(rootDir, "dist-electron/main/index.js");
const electronPath = await ensureElectron();

const child = spawn(electronPath, [appEntry], {
  cwd: rootDir,
  env: {
    ...process.env,
    HTML_VIEWER_OPEN_FOLDER: sampleDeck,
    HTML_VIEWER_AUTO_QUIT_MS: "1500"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let output = "";
const appendOutput = (chunk) => {
  output += chunk.toString();
};

child.stdout.on("data", appendOutput);
child.stderr.on("data", appendOutput);

const timeout = setTimeout(() => {
  child.kill("SIGTERM");
  console.error("Electron smoke test timed out.");
  if (output.trim()) {
    console.error(output.trim());
  }
  process.exit(1);
}, 15000);

child.on("error", (error) => {
  clearTimeout(timeout);
  console.error(error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  clearTimeout(timeout);

  if (code === 0) {
    console.log("Electron smoke test passed.");
    return;
  }

  console.error(`Electron smoke test failed with code ${code ?? "null"} signal ${signal ?? "null"}.`);
  if (output.trim()) {
    console.error(output.trim());
  }
  process.exit(code ?? 1);
});
