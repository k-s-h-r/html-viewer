import { createServer, type Server } from "node:http";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { lookup as lookupMime } from "mrmime";
import sirv from "sirv";

const SIRV_EXTENSIONS = ["html", "htm"];

export interface LocalServerHandle {
  rootDir: string;
  origin: string;
  stop(): Promise<void>;
  toUrl(href: string): string;
}

type ResolveResult =
  | { kind: "file"; filePath: string }
  | { kind: "not_found" }
  | { kind: "forbidden" };

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

function pathnameFromRequestUrl(requestUrl: string): string | null {
  try {
    const url = new URL(requestUrl, "http://127.0.0.1");
    let pathname = url.pathname;

    if (pathname.includes("%")) {
      try {
        pathname = decodeURI(pathname);
      } catch {
        return null;
      }
    }

    return pathname;
  } catch {
    return null;
  }
}

function toAssume(uri: string, extensions: string[]): string[] {
  let normalizedUri = uri;
  const len = normalizedUri.length - 1;

  if (normalizedUri.charCodeAt(len) === 47) {
    normalizedUri = normalizedUri.substring(0, len);
  }

  const candidates: string[] = [];
  const indexBase = `${normalizedUri}/index`;

  for (const extension of extensions) {
    const suffix = extension ? `.${extension}` : "";

    if (normalizedUri) {
      candidates.push(`${normalizedUri}${suffix}`);
    }

    candidates.push(`${indexBase}${suffix}`);
  }

  return candidates;
}

async function resolveSafeFile(rootDir: string, requestUrl: string): Promise<ResolveResult> {
  if (!resolveRequestPath(rootDir, requestUrl)) {
    return { kind: "forbidden" };
  }

  const pathname = pathnameFromRequestUrl(requestUrl);
  if (!pathname) {
    return { kind: "forbidden" };
  }

  for (const candidate of toAssume(pathname, ["", ...SIRV_EXTENSIONS])) {
    const relativePath = candidate.replace(/^[/\\]+/, "");
    const targetPath = path.resolve(rootDir, relativePath);

    if (!isInsideRoot(rootDir, targetPath)) {
      continue;
    }

    try {
      const fileStat = await stat(targetPath);
      if (fileStat.isDirectory()) {
        continue;
      }

      const [realRootDir, realFilePath] = await Promise.all([
        realpath(rootDir),
        realpath(targetPath)
      ]);

      if (!isInsideRoot(realRootDir, realFilePath)) {
        return { kind: "forbidden" };
      }

      return { kind: "file", filePath: targetPath };
    } catch {
      continue;
    }
  }

  return { kind: "not_found" };
}

function contentTypeForFile(filePath: string): string {
  const mimeType = lookupMime(path.extname(filePath)) ?? "application/octet-stream";
  return mimeType === "text/html" ? `${mimeType};charset=utf-8` : mimeType;
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
  const serve = sirv(rootDir, {
    dev: false,
    etag: true,
    dotfiles: false,
    extensions: SIRV_EXTENSIONS,
    setHeaders(response) {
      response.setHeader("X-Content-Type-Options", "nosniff");
    }
  });

  const server = createServer(async (request, response) => {
    if (!request.url || !request.method || !["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405);
      response.end("Method Not Allowed");
      return;
    }

    const resolved = await resolveSafeFile(rootDir, request.url);

    if (resolved.kind === "forbidden") {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    if (request.method === "HEAD") {
      if (resolved.kind === "not_found") {
        response.writeHead(404);
        response.end("Not Found");
        return;
      }

      const fileStat = await stat(resolved.filePath);
      response.writeHead(200, {
        "Content-Type": contentTypeForFile(resolved.filePath),
        "Content-Length": fileStat.size,
        "X-Content-Type-Options": "nosniff"
      });
      response.end();
      return;
    }

    serve(request, response);
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
