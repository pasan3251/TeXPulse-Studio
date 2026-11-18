import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDesktopBrowserArgs,
  getDesktopProfileDir,
  shouldKeepServerAliveOnBrowserExit,
} from "./desktop-launcher.js";
import { startLocalServer } from "./index.js";
import { LocalProjectStore, normalizeProjectPath } from "./project-store.js";
import { RecoveryService } from "./recovery-service.js";
import { exportProjectZipBuffer, importProjectZipBuffer } from "./zip-service.js";

describe("@texpulse/server project store", () => {
  it("rejects path traversal and reads/writes project files atomically", async () => {
    expect(() => normalizeProjectPath("../secret.tex")).toThrow();
    const root = await mkdtemp(join(tmpdir(), "texpulse-server-"));
    try {
      const store = await LocalProjectStore.open(root);
      await store.writeProjectFile("main.tex", "\\documentclass{article}\n");
      const files = await store.listTextFiles();
      expect(files).toHaveLength(1);
      expect(files[0]?.path).toBe("main.tex");
      expect(files[0]?.content).toContain("\\documentclass{article}");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("saves, loads, and clears atomic crash recovery snapshots", async () => {
    const root = await mkdtemp(join(tmpdir(), "texpulse-recovery-"));
    try {
      const recovery = new RecoveryService(root);
      expect(await recovery.load()).toBeNull();

      await recovery.save({
        activeFilePath: "chapters/methodology.tex",
        buffers: [
          {
            path: "chapters/methodology.tex",
            content: "\\section{Draft}\nUnsaved line",
            lastModified: 123456,
          },
        ],
      });

      const loaded = await recovery.load();
      expect(loaded?.activeFilePath).toBe("chapters/methodology.tex");
      expect(loaded?.buffers).toHaveLength(1);
      expect(loaded?.buffers[0]?.content).toContain("Unsaved line");

      expect(await recovery.clear()).toBe(true);
      expect(await recovery.load()).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("exports an Overleaf-compatible .zip excluding cache dirs and imports cleanly into another project", async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), "texpulse-zip-src-"));
    const destRoot = await mkdtemp(join(tmpdir(), "texpulse-zip-dst-"));
    try {
      const srcStore = await LocalProjectStore.open(sourceRoot);
      await srcStore.writeProjectFile("main.tex", "\\documentclass{article}\n\\begin{document}\nZip ok.\n\\end{document}\n");
      await srcStore.writeProjectFile("chapters/intro.tex", "\\section{Intro}\n");
      await mkdir(join(sourceRoot, ".texpulse-cache"), { recursive: true });
      await writeFile(join(sourceRoot, ".texpulse-cache", "preamble_cache.fmt"), "huge-binary-cache");

      const zipBuf = await exportProjectZipBuffer(sourceRoot);
      const dstStore = await LocalProjectStore.open(destRoot);
      const imported = await importProjectZipBuffer(dstStore, zipBuf);

      expect(imported.importedPaths.sort()).toEqual(["chapters/intro.tex", "main.tex"]);
      const dstFiles = await dstStore.listTextFiles();
      expect(dstFiles.map((f) => f.path)).toEqual(["chapters/intro.tex", "main.tex"]);
      expect(dstFiles.find((f) => f.path === "main.tex")?.content).toContain("Zip ok.");
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
      await rm(destRoot, { recursive: true, force: true });
    }
  });

  it("serves static SPA assets and /api/* routes from a single unified port and blocks traversal", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "texpulse-spa-proj-"));
    const clientDist = await mkdtemp(join(tmpdir(), "texpulse-spa-dist-"));
    let server: Awaited<ReturnType<typeof startLocalServer>> | null = null;
    try {
      await mkdir(join(clientDist, "assets"), { recursive: true });
      await writeFile(join(clientDist, "index.html"), "<!doctype html><html><body><div id=\"root\">TeXPulse</div></body></html>", "utf8");
      await writeFile(join(clientDist, "assets", "bundle.js"), "console.log('ok');", "utf8");

      server = await startLocalServer(projectRoot, 0, {
        serveClient: true,
        clientDistDir: clientDist,
      });
      const port = (server.address() as AddressInfo).port;
      const base = `http://127.0.0.1:${String(port)}`;

      const rawTraversalStatus = await new Promise<number>((resolveStatus, rejectStatus) => {
        const req = httpRequest(
          {
            hostname: "127.0.0.1",
            port,
            path: "/assets/%2e%2e/%2e%2e/secret.txt",
            method: "GET",
          },
          (res) => {
            res.resume();
            resolveStatus(res.statusCode ?? 0);
          },
        );
        req.on("error", rejectStatus);
        req.end();
      });

      const [rootRes, assetRes, fallbackRes, healthRes, apiMissingRes] = await Promise.all([
        fetch(`${base}/`),
        fetch(`${base}/assets/bundle.js`),
        fetch(`${base}/workspace/editor`),
        fetch(`${base}/api/health`),
        fetch(`${base}/api/does-not-exist`),
      ]);

      expect(rootRes.status).toBe(200);
      expect(await rootRes.text()).toContain("TeXPulse");
      expect(assetRes.status).toBe(200);
      expect(assetRes.headers.get("content-type")).toContain("application/javascript");
      expect(await assetRes.text()).toContain("console.log('ok')");
      expect(fallbackRes.status).toBe(200);
      expect(await fallbackRes.text()).toContain('<div id="root">');
      expect(healthRes.status).toBe(200);
      expect(((await healthRes.json()) as { ok: boolean }).ok).toBe(true);
      expect(rawTraversalStatus).toBe(403);
      expect(apiMissingRes.status).toBe(404);
    } finally {
      if (server) {
        await new Promise<void>((resolveClose) => server!.close(() => resolveClose()));
      }
      await rm(projectRoot, { recursive: true, force: true });
      await rm(clientDist, { recursive: true, force: true });
    }
  });

  it("hardens desktop profile isolation, broker handoff guard, and POST /api/desktop/shutdown", async () => {
    const expectedSuffix = join(".texpulse", "desktop-profile");
    expect(getDesktopProfileDir("/Users/test").endsWith(expectedSuffix)).toBe(true);
    expect(getDesktopProfileDir("/Users/test").includes(`${sep}.texpulse${sep}`)).toBe(true);

    expect(buildDesktopBrowserArgs("http://127.0.0.1:4317/", "/tmp/profile")).toEqual([
      "--app=http://127.0.0.1:4317/",
      "--user-data-dir=/tmp/profile",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-mode",
      "--disable-extensions",
      "--window-size=1440,900",
    ]);

    expect(shouldKeepServerAliveOnBrowserExit(450, 0)).toBe(true);
    expect(shouldKeepServerAliveOnBrowserExit(3000, 0)).toBe(false);
    expect(shouldKeepServerAliveOnBrowserExit(450, 1)).toBe(false);

    const projectRoot = await mkdtemp(join(tmpdir(), "texpulse-shutdown-proj-"));
    let shutdownCallbackCalled = false;
    let shutdownPromiseResolve!: () => void;
    const shutdownPromise = new Promise<void>((resolvePromise) => {
      shutdownPromiseResolve = resolvePromise;
    });

    const server = await startLocalServer(projectRoot, 0, {
      serveClient: false,
      onDesktopShutdown: () => {
        shutdownCallbackCalled = true;
        shutdownPromiseResolve();
      },
    });
    try {
      const port = (server.address() as AddressInfo).port;
      const res = await fetch(`http://127.0.0.1:${String(port)}/api/desktop/shutdown`, {
        method: "POST",
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; shuttingDown: boolean };
      expect(body).toEqual({ ok: true, shuttingDown: true });
      await shutdownPromise;
      expect(shutdownCallbackCalled).toBe(true);
    } finally {
      if (server.listening) {
        await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
      }
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
