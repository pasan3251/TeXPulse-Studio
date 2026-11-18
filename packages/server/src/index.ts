import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_PROJECT_FILES,
  LATEXMK_BASE_FLAGS,
  type CompileEngine,
  type CompileRequestPayload,
  type RecoveryBufferSnapshot,
} from "@texpulse/shared";
import { CompilerRunner } from "./compiler/compiler-runner.js";
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
) {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(projectDirectory, { recursive: true });

  let store = await LocalProjectStore.open(projectDirectory);
  await ensureSeededWorkspace(store);
  let compilerRunner = new CompilerRunner(store.rootDirectory);
  let recoveryService = new RecoveryService(store.rootDirectory);
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

    const requestUrl = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "127.0.0.1"}`,
    );

    try {
      if (req.method === "GET" && requestUrl.pathname === "/api/health") {
        sendJson(res, 200, {
          ok: true,
          phase: 3,
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
  startLocalServer(projectDir, port)
    .then(() => {
      console.log(
        `TeXPulse Studio 2.0 backend listening on http://127.0.0.1:${String(port)}`,
      );
    })
    .catch((err: unknown) => {
      console.error("Failed to start local server:", err);
      process.exitCode = 1;
    });
}
