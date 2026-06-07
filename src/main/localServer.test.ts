import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { request } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { startLocalServer, type LocalServerHandle } from "./localServer.js";

const sampleDeckPath = path.resolve(process.cwd(), "sample-decks/basic");

let server: LocalServerHandle | null = null;

async function requestRawPath(origin: string, rawPath: string): Promise<number> {
  const url = new URL(origin);

  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: url.hostname,
        port: url.port,
        path: rawPath,
        method: "GET"
      },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode ?? 0));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

afterEach(async () => {
  if (server) {
    await server.stop();
    server = null;
  }
});

describe("startLocalServer", () => {
  it("serves files from the selected root on 127.0.0.1", async () => {
    server = await startLocalServer(sampleDeckPath);

    expect(server.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

    const response = await fetch(server.toUrl("intro.html"));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("概要");
  });

  it("supports HEAD requests", async () => {
    server = await startLocalServer(sampleDeckPath);

    const response = await fetch(server.toUrl("intro.html"), { method: "HEAD" });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBeTruthy();
  });

  it("rejects path traversal outside the root", async () => {
    server = await startLocalServer(sampleDeckPath);

    const status = await requestRawPath(server.origin, "/..%2fPLAN.md");

    expect(status).toBe(403);
  });

  it("serves video files with automatic mime types", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "html-viewer-"));

    try {
      await writeFile(path.join(tmpDir, "clip.mp4"), "fake-video");

      server = await startLocalServer(tmpDir);
      const response = await fetch(server.toUrl("clip.mp4"));

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("video/mp4");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("serves updated file content after write", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "html-viewer-"));

    try {
      const filePath = path.join(tmpDir, "page.html");
      await writeFile(filePath, "<html><body>version-1</body></html>");

      server = await startLocalServer(tmpDir);

      const first = await fetch(server.toUrl("page.html"));
      expect(await first.text()).toContain("version-1");

      await writeFile(filePath, "<html><body>version-2</body></html>");

      const second = await fetch(server.toUrl("page.html"));
      expect(await second.text()).toContain("version-2");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("rejects symlink escapes outside the root", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "html-viewer-"));
    const secretFile = path.join(tmpDir, "secret.txt");

    try {
      await writeFile(secretFile, "secret");
      const deckDir = path.join(tmpDir, "deck");
      await mkdir(deckDir);
      await writeFile(path.join(deckDir, "index.html"), "<html></html>");
      await symlink(secretFile, path.join(deckDir, "escape.txt"));

      server = await startLocalServer(deckDir);
      const status = await requestRawPath(server.origin, "/escape.txt");

      expect(status).toBe(403);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
