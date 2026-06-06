import { createServer, type Server } from "node:http";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

export interface LocalServerHandle {
  rootDir: string;
  origin: string;
  stop(): Promise<void>;
  toUrl(href: string): string;
}

function isInsideRoot(rootDir: string, targetPath: string): boolean {
  const relative = path.relative(rootDir, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveRequestPath(rootDir: string, requestUrl: string): string | null {
  let normalizedPath: string;

  try {
    const url = new URL(requestUrl, "http://127.0.0.1");
    const decodedPath = decodeURIComponent(url.pathname).replace(/^[/\\]+/, "");
    normalizedPath = path.normalize(decodedPath);
  } catch {
    return null;
  }

  const targetPath = path.resolve(rootDir, normalizedPath);

  if (!isInsideRoot(rootDir, targetPath)) {
    return null;
  }

  return targetPath;
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export async function startLocalServer(rootDir: string): Promise<LocalServerHandle> {
  const server = createServer(async (request, response) => {
    if (!request.url || !request.method || !["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405);
      response.end("Method Not Allowed");
      return;
    }

    const resolvedPath = resolveRequestPath(rootDir, request.url);
    if (!resolvedPath) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    try {
      const fileStat = await stat(resolvedPath);
      const filePath = fileStat.isDirectory()
        ? path.join(resolvedPath, "index.html")
        : resolvedPath;
      const finalStat = fileStat.isDirectory() ? await stat(filePath) : fileStat;

      if (!finalStat.isFile() || !isInsideRoot(rootDir, filePath)) {
        response.writeHead(404);
        response.end("Not Found");
        return;
      }

      const [realRootDir, realFilePath] = await Promise.all([
        realpath(rootDir),
        realpath(filePath)
      ]);
      if (!isInsideRoot(realRootDir, realFilePath)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }

      const contentType =
        MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";

      response.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": finalStat.size,
        "X-Content-Type-Options": "nosniff"
      });

      if (request.method === "HEAD") {
        response.end();
        return;
      }

      createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404);
      response.end("Not Found");
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await closeServer(server);
    throw new Error("ローカルサーバーのポート取得に失敗しました。");
  }

  const origin = `http://127.0.0.1:${address.port}`;

  return {
    rootDir,
    origin,
    async stop() {
      await closeServer(server);
    },
    toUrl(href) {
      return new URL(href, `${origin}/`).toString();
    }
  };
}
