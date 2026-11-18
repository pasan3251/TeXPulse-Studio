import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { basename, dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_PROJECT_FILES,
  LATEXMK_BASE_FLAGS,
  type AssistantProviderConfig,
  type CompileEngine,
  type CompileRequestPayload,
  type ContextAnchoredPromptInput,
  type ProjectFile,
  type RecoveryBufferSnapshot,
} from "@texpulse/shared";
import { AssistantService } from "./assistant/assistant-service.js";
import { CompilerRunner } from "./compiler/compiler-runner.js";
import { TexCountService } from "./compiler/texcount-service.js";
import {
  LocalProjectStore,
  ProjectPathError,
  normalizeProjectPath,
  resolveProjectPath,
} from "./project-store.js";
import { RecoveryService } from "./recovery-service.js";
import { SynctexService, SynctexServiceError } from "./synctex/synctex-service.js";
import { exportProjectZipBuffer, importProjectZipBuffer } from "./zip-service.js";

const DEFAULT_PORT = 4317;
const MAX_JSON_BODY_BYTES = 70 * 1024 * 1024;
const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(THIS_FILE), "../../..");
const DEFAULT_WORKSPACE = resolve(REPO_ROOT, ".texpulse-workspace");
const DEFAULT_CLIENT_DIST = resolve(REPO_ROOT, "packages/client/dist");

const STATIC_MIME_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".pdf": "application/pdf",
};

export interface StartLocalServerOptions {
  serveClient?: boolean | undefined;
  clientDistDir?: string | undefined;
}

async function tryServeStaticSpa(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  rawPathname: string,
  clientDistDir: string,
): Promise<boolean> {
  if ((req.method !== "GET" && req.method !== "HEAD") || pathname.startsWith("/api/")) {
    return false;
  }

  let decodedPath: string;
  let decodedRawPath: string;
  try {
    decodedPath = decodeURIComponent(pathname);
    decodedRawPath = decodeURIComponent(rawPathname);
  } catch {
    sendJson(res, 400, { ok: false, error: "Malformed request path." });
    return true;
  }

  if (
    decodedPath.includes("\0") ||
    decodedRawPath.includes("\0") ||
    decodedPath.split(/[\\/]/u).includes("..") ||
    decodedRawPath.split(/[\\/]/u).includes("..")
  ) {
    sendJson(res, 403, { ok: false, error: "Forbidden path traversal." });
    return true;
  }

  const distRoot = resolve(clientDistDir);
  const relPath = decodedPath.replace(/^\/+/u, "") || "index.html";
  const resolvedCandidate = resolve(distRoot, relPath);

  if (resolvedCandidate !== distRoot && !resolvedCandidate.startsWith(distRoot + sep)) {
    sendJson(res, 403, { ok: false, error: "Forbidden path traversal." });
    return true;
  }

  const sendFile = async (filePath: string, isImmutableAsset: boolean): Promise<void> => {
    const ext = extname(filePath).toLowerCase();
    const contentType = STATIC_MIME_TYPES[ext] ?? "application/octet-stream";
    const data = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": String(data.byteLength),
      "Cache-Control": isImmutableAsset ? "public, max-age=31536000, immutable" : "no-cache",
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(data);
  };

  try {
    const candidateStat = await stat(resolvedCandidate);
    if (candidateStat.isFile()) {
      await sendFile(resolvedCandidate, relPath.startsWith("assets/"));
      return true;
    }
  } catch {
    // Fall through to index.html SPA fallback for extensionless client routes
  }

  if (extname(relPath) !== "") {
    return false;
  }

  const indexPath = resolve(distRoot, "index.html");
  if (!existsSync(indexPath)) {
    return false;
  }
  await sendFile(indexPath, false);
  return true;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.length;
    if (totalBytes > MAX_JSON_BODY_BYTES) {
      throw new Error("Request JSON body exceeds maximum size limit.");
    }
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw.trim() === "" ? {} : (JSON.parse(raw) as unknown);
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(payload));
}

async function ensureSeededWorkspace(store: LocalProjectStore): Promise<void> {
  const existing = await store.listTextFiles();
  if (existing.length > 0) return;

  for (const file of DEFAULT_PROJECT_FILES) {
    await store.writeProjectFile(file.path, file.content);
  }
}

export async function startLocalServer(
  projectDirectory = DEFAULT_WORKSPACE,
  port = DEFAULT_PORT,
  options: StartLocalServerOptions = {},
) {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(projectDirectory, { recursive: true });

  const clientDistDir = resolve(
    options.clientDistDir ?? process.env.TEXPULSE_CLIENT_DIST ?? DEFAULT_CLIENT_DIST,
  );
  const serveClient =
    options.serveClient ??
    (process.argv.includes("--serve-client") ||
      process.env.NODE_ENV === "production" ||
      process.env.TEXPULSE_SERVE_CLIENT === "1" ||
      existsSync(resolve(clientDistDir, "index.html")));

  let store = await LocalProjectStore.open(projectDirectory);
  await ensureSeededWorkspace(store);
  let compilerRunner = new CompilerRunner(store.rootDirectory);
  let recoveryService = new RecoveryService(store.rootDirectory);
  let texcountService = new TexCountService(store.rootDirectory);
  const assistantService = new AssistantService();
  const synctexService = new SynctexService();
  const recentDirectories: string[] = [store.rootDirectory];

  const recordRecentDirectory = (dir: string): void => {
    const idx = recentDirectories.indexOf(dir);
    if (idx !== -1) recentDirectories.splice(idx, 1);
    recentDirectories.unshift(dir);
    if (recentDirectories.length > 10) recentDirectories.length = 10;
  };

  const server = createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      sendJson(res, 204, null);
      return;
    }

    const rawPathname = (req.url ?? "/").split(/[?#]/u)[0] ?? "/";
    const requestUrl = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "127.0.0.1"}`,
    );

    try {
      if (req.method === "GET" && requestUrl.pathname === "/api/health") {
        sendJson(res, 200, {
          ok: true,
          version: "2.0.0",
          phase: 5,
          compilerFlags: LATEXMK_BASE_FLAGS,
          projectRoot: store.rootDirectory,
        });
        return;
      }

      if (req.method === "GET" && requestUrl.pathname === "/api/project") {
        const [files, recovery] = await Promise.all([
          store.listTextFiles(),
          recoveryService.load(),
        ]);
        sendJson(res, 200, {
          ok: true,
          projectRoot: store.rootDirectory,
          projectName: basename(store.rootDirectory),
          recentDirectories,
          files,
          recovery,
        });
        return;
      }

      if (req.method === "POST" && requestUrl.pathname === "/api/project/open") {
        const body = (await readJsonBody(req)) as { directory?: unknown };
        if (typeof body.directory !== "string" || body.directory.trim() === "") {
          sendJson(res, 400, { ok: false, error: "Expected non-empty directory path." });
          return;
        }
        const resolvedDir = resolve(body.directory.trim());
        const dirStat = await stat(resolvedDir).catch(() => null);
        if (!dirStat?.isDirectory()) {
          sendJson(res, 400, {
            ok: false,
            error: `Directory does not exist: ${resolvedDir}`,
          });
          return;
        }
        await compilerRunner.cancelActiveBuild();
        store = await LocalProjectStore.open(resolvedDir);
        compilerRunner = new CompilerRunner(store.rootDirectory);
        recoveryService = new RecoveryService(store.rootDirectory);
        texcountService = new TexCountService(store.rootDirectory);
        recordRecentDirectory(store.rootDirectory);
        const [files, recovery] = await Promise.all([
          store.listTextFiles(),
          recoveryService.load(),
        ]);
        sendJson(res, 200, {
          ok: true,
          projectRoot: store.rootDirectory,
          projectName: basename(store.rootDirectory),
          recentDirectories,
          files,
          recovery,
        });
        return;
      }

      if (req.method === "PUT" && requestUrl.pathname === "/api/project/file") {
        const body = (await readJsonBody(req)) as {
          path?: unknown;
          content?: unknown;
        };
        if (typeof body.path !== "string" || typeof body.content !== "string") {
          sendJson(res, 400, {
            ok: false,
            error: "Expected string path and content.",
          });
          return;
        }
        const file = await store.writeProjectFile(body.path, body.content);
        sendJson(res, 200, { ok: true, file });
        return;
      }

      if (req.method === "POST" && requestUrl.pathname === "/api/project/autosave") {
        const body = (await readJsonBody(req)) as {
          files?: ReadonlyArray<{ path?: unknown; content?: unknown }>;
        };
        if (!Array.isArray(body.files)) {
          sendJson(res, 400, { ok: false, error: "Expected files array." });
          return;
        }
        const savedPaths: string[] = [];
        for (const item of body.files) {
          if (typeof item.path === "string" && typeof item.content === "string") {
            const saved = await store.writeProjectFile(item.path, item.content);
            savedPaths.push(saved.path);
          }
        }
        await recoveryService.clear();
        sendJson(res, 200, {
          ok: true,
          savedPaths,
          savedAt: new Date().toISOString(),
        });
        return;
      }

      if (req.method === "GET" && requestUrl.pathname === "/api/recovery") {
        const snapshot = await recoveryService.load();
        sendJson(res, 200, { ok: true, snapshot });
        return;
      }

      if (req.method === "POST" && requestUrl.pathname === "/api/recovery") {
        const body = (await readJsonBody(req)) as {
          activeFilePath?: unknown;
          buffers?: ReadonlyArray<Partial<RecoveryBufferSnapshot>>;
        };
        if (!Array.isArray(body.buffers)) {
          sendJson(res, 400, { ok: false, error: "Expected recovery buffers array." });
          return;
        }
        const buffers: RecoveryBufferSnapshot[] = [];
        for (const buf of body.buffers) {
          if (typeof buf.path === "string" && typeof buf.content === "string") {
            buffers.push({
              path: buf.path,
              content: buf.content,
              lastModified: typeof buf.lastModified === "number" ? buf.lastModified : Date.now(),
            });
          }
        }
        const snapshot = await recoveryService.save({
          activeFilePath:
            typeof body.activeFilePath === "string" && body.activeFilePath.trim() !== ""
              ? body.activeFilePath
              : "main.tex",
          buffers,
        });
        sendJson(res, 200, { ok: true, snapshot });
        return;
      }

      if (req.method === "DELETE" && requestUrl.pathname === "/api/recovery") {
        const cleared = await recoveryService.clear();
        sendJson(res, 200, { ok: true, cleared });
        return;
      }

      if (req.method === "GET" && requestUrl.pathname === "/api/project/export-zip") {
        const zipBuffer = await exportProjectZipBuffer(store.rootDirectory);
        const safeName = basename(store.rootDirectory).replace(/[^A-Za-z0-9._-]/gu, "_") || "texpulse-project";
        res.writeHead(200, {
          "Content-Type": "application/zip",
          "Content-Length": String(zipBuffer.byteLength),
          "Content-Disposition": `attachment; filename="${safeName}.zip"`,
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(zipBuffer);
        return;
      }

      if (req.method === "POST" && requestUrl.pathname === "/api/project/import-zip") {
        const body = (await readJsonBody(req)) as { archiveBase64?: unknown };
        if (typeof body.archiveBase64 !== "string" || body.archiveBase64.trim() === "") {
          sendJson(res, 400, { ok: false, error: "Expected base64 ZIP archive payload." });
          return;
        }
        const cleanBase64 = body.archiveBase64.replace(/^data:[^,]+,/u, "").trim();
        const zipBuffer = Buffer.from(cleanBase64, "base64");
        const result = await importProjectZipBuffer(store, zipBuffer);
        await recoveryService.clear();
        const files = await store.listTextFiles();
        sendJson(res, 200, {
          ok: true,
          importedPaths: result.importedPaths,
          skippedPaths: result.skippedPaths,
          files,
        });
        return;
      }

      if (req.method === "POST" && requestUrl.pathname === "/api/compile") {
        const body = (await readJsonBody(req)) as CompileRequestPayload;
        const rootFile =
          typeof body.rootFile === "string" && body.rootFile.trim() !== ""
            ? body.rootFile
            : "main.tex";
        const engine: CompileEngine =
          body.engine === "xelatex" || body.engine === "lualatex"
            ? body.engine
            : "pdflatex";

        if (Array.isArray(body.files)) {
          for (const item of body.files) {
            if (typeof item.path === "string" && typeof item.content === "string") {
              await store.writeProjectFile(item.path, item.content);
            }
          }
          await recoveryService.clear();
        }

        const knownFiles = await store.listTextFiles();
        const result = await compilerRunner.compile({
          rootFile,
          engine,
          forceFullBuild: body.forceFullBuild === true,
          knownFiles: knownFiles.map((f) => ({ path: f.path, content: f.content })),
        });
        sendJson(res, 200, { ok: true, result });
        return;
      }

      if (req.method === "POST" && requestUrl.pathname === "/api/compile/cancel") {
        const cancelled = await compilerRunner.cancelActiveBuild();
        sendJson(res, 200, { ok: true, cancelled });
        return;
      }

      if (req.method === "GET" && requestUrl.pathname === "/api/pdf") {
        const rootFile = requestUrl.searchParams.get("rootFile") ?? "main.tex";
        const bytes = await compilerRunner.readPdfBytes(rootFile);
        res.writeHead(200, {
          "Content-Type": "application/pdf",
          "Content-Length": String(bytes.byteLength),
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(bytes);
        return;
      }

      if (req.method === "POST" && requestUrl.pathname === "/api/synctex/forward") {
        const body = (await readJsonBody(req)) as {
          rootFile?: unknown;
          path?: unknown;
          line?: unknown;
          column?: unknown;
        };
        if (
          typeof body.path !== "string" ||
          typeof body.line !== "number" ||
          !Number.isInteger(body.line) ||
          body.line < 1
        ) {
          sendJson(res, 400, {
            ok: false,
            error: "Expected valid source path and positive integer line.",
          });
          return;
        }
        const rootFile =
          typeof body.rootFile === "string" ? body.rootFile : "main.tex";
        const normalizedSource = normalizeProjectPath(body.path);
        const sourcePath = await resolveProjectPath(
          store.rootDirectory,
          normalizedSource,
        );
        const syncPaths = compilerRunner.getSyncPaths(rootFile);
        const target = await synctexService.forward({
          projectDirectory: store.rootDirectory,
          sourcePath,
          line: body.line,
          column: typeof body.column === "number" && body.column > 0 ? body.column : 1,
          pdfPath: syncPaths.pdfPath,
          buildDirectory: syncPaths.buildDirectory,
        });
        sendJson(res, 200, { ok: true, target });
        return;
      }

      if (req.method === "POST" && requestUrl.pathname === "/api/synctex/inverse") {
        const body = (await readJsonBody(req)) as {
          rootFile?: unknown;
          page?: unknown;
          x?: unknown;
          y?: unknown;
        };
        if (
          typeof body.page !== "number" ||
          typeof body.x !== "number" ||
          typeof body.y !== "number"
        ) {
          sendJson(res, 400, {
            ok: false,
            error: "Expected numeric page, x, and y coordinates.",
          });
          return;
        }
        const rootFile =
          typeof body.rootFile === "string" ? body.rootFile : "main.tex";
        const syncPaths = compilerRunner.getSyncPaths(rootFile);
        const files = await store.listTextFiles();
        const target = await synctexService.inverse({
          projectDirectory: store.rootDirectory,
          page: Math.max(1, Math.round(body.page)),
          x: body.x,
          y: body.y,
          pdfPath: syncPaths.pdfPath,
          buildDirectory: syncPaths.buildDirectory,
          projectFiles: files.map((f) => f.path),
        });
        sendJson(res, 200, { ok: true, target });
        return;
      }

      if (req.method === "POST" && requestUrl.pathname === "/api/texcount") {
        const body = (await readJsonBody(req)) as {
          rootFile?: unknown;
          files?: ReadonlyArray<{ path?: unknown; content?: unknown }>;
        };
        const rootFile =
          typeof body.rootFile === "string" && body.rootFile.trim() !== ""
            ? body.rootFile
            : "main.tex";

        let projectFiles: ProjectFile[];
        if (Array.isArray(body.files) && body.files.length > 0) {
          for (const item of body.files) {
            if (typeof item.path === "string" && typeof item.content === "string") {
              await store.writeProjectFile(item.path, item.content);
            }
          }
          projectFiles = await store.listTextFiles();
        } else {
          projectFiles = await store.listTextFiles();
        }

        const counts = await texcountService.count({ rootFile, files: projectFiles });
        sendJson(res, 200, { ok: true, counts });
        return;
      }

      if (req.method === "GET" && requestUrl.pathname === "/api/assistant/status") {
        const status = await assistantService.getStatus();
        sendJson(res, 200, { ok: true, status });
        return;
      }

      if (req.method === "POST" && requestUrl.pathname === "/api/assistant/config") {
        const body = (await readJsonBody(req)) as Partial<AssistantProviderConfig>;
        const status = await assistantService.configure(body);
        sendJson(res, 200, { ok: true, status });
        return;
      }

      if (req.method === "POST" && requestUrl.pathname === "/api/assistant/fix-error") {
        const body = (await readJsonBody(req)) as Partial<ContextAnchoredPromptInput>;
        if (typeof body.filePath !== "string" || typeof body.surroundingLines !== "string") {
          sendJson(res, 400, {
            ok: false,
            error: "Expected ContextAnchoredPromptInput with filePath and surroundingLines.",
          });
          return;
        }
        const proposal = await assistantService.proposeErrorFix({
          filePath: body.filePath,
          line: typeof body.line === "number" ? body.line : 1,
          currentSection: body.currentSection ?? null,
          activeEnvironment: body.activeEnvironment ?? null,
          loadedPackages: Array.isArray(body.loadedPackages) ? body.loadedPackages : [],
          surroundingLines: body.surroundingLines,
          validLabels: Array.isArray(body.validLabels) ? body.validLabels : [],
          validCitationKeys: Array.isArray(body.validCitationKeys) ? body.validCitationKeys : [],
          diagnostic: body.diagnostic,
          instruction: body.instruction,
        });
        sendJson(res, 200, { ok: true, proposal });
        return;
      }

      if (req.method === "POST" && requestUrl.pathname === "/api/assistant/generate") {
        const body = (await readJsonBody(req)) as Partial<ContextAnchoredPromptInput>;
        if (typeof body.instruction !== "string" || body.instruction.trim() === "") {
          sendJson(res, 400, {
            ok: false,
            error: "Expected non-empty instruction string.",
          });
          return;
        }
        const result = await assistantService.generateInlineLatex({
          filePath: typeof body.filePath === "string" ? body.filePath : "main.tex",
          line: typeof body.line === "number" ? body.line : 1,
          currentSection: body.currentSection ?? null,
          activeEnvironment: body.activeEnvironment ?? null,
          loadedPackages: Array.isArray(body.loadedPackages) ? body.loadedPackages : [],
          surroundingLines: typeof body.surroundingLines === "string" ? body.surroundingLines : "",
          validLabels: Array.isArray(body.validLabels) ? body.validLabels : [],
          validCitationKeys: Array.isArray(body.validCitationKeys) ? body.validCitationKeys : [],
          instruction: body.instruction,
        });
        sendJson(res, 200, { ok: true, result });
        return;
      }

      if (
        serveClient &&
        (await tryServeStaticSpa(
          req,
          res,
          requestUrl.pathname,
          rawPathname,
          clientDistDir,
        ))
      ) {
        return;
      }

      sendJson(res, 404, { ok: false, error: "Not found" });
    } catch (error) {
      const status =
        error instanceof ProjectPathError
          ? 400
          : error instanceof SynctexServiceError
            ? 422
            : 500;
      sendJson(res, status, {
        ok: false,
        error: error instanceof Error ? error.message : "Unexpected server error",
      });
    }
  });

  await new Promise<void>((resolvePromise) => {
    server.listen(port, "127.0.0.1", () => resolvePromise());
  });

  return server;
}

if (process.argv[1] !== undefined && resolve(THIS_FILE) === resolve(process.argv[1])) {
  const port = Number(process.env.TEXPULSE_PORT ?? DEFAULT_PORT);
  const projectDir = process.env.TEXPULSE_PROJECT_DIR;
  const serveClient =
    process.argv.includes("--serve-client") ||
    process.env.NODE_ENV === "production" ||
    process.env.TEXPULSE_SERVE_CLIENT === "1" ||
    existsSync(resolve(DEFAULT_CLIENT_DIST, "index.html"));

  startLocalServer(projectDir, port, { serveClient })
    .then((server) => {
      const addr = server.address() as AddressInfo | null;
      const boundPort = addr?.port ?? port;
      console.log(
        `TeXPulse Studio 2.0 server listening on http://127.0.0.1:${String(boundPort)} (${serveClient ? "Unified SPA + API" : "API"})`,
      );
    })
    .catch((err: unknown) => {
      console.error("Failed to start local server:", err);
      process.exitCode = 1;
    });
}
