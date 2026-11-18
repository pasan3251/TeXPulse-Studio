import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startLocalServer } from "./index.js";

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(THIS_FILE), "../../..");
const DEFAULT_CLIENT_DIST = resolve(REPO_ROOT, "packages/client/dist");

export const PREMATURE_BROKER_EXIT_MS = 3000;

export interface DesktopBrowserCandidate {
  executable: string;
  kind: "msedge" | "chrome" | "chromium";
}

export function getDesktopProfileDir(home = homedir()): string {
  return join(home, ".texpulse", "desktop-profile");
}

export function buildDesktopBrowserArgs(serverUrl: string, profileDir: string): string[] {
  return [
    `--app=${serverUrl}`,
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-mode",
    "--disable-extensions",
    "--window-size=1440,900",
  ];
}

export function shouldKeepServerAliveOnBrowserExit(
  elapsedMs: number,
  exitCode: number | null,
): boolean {
  return elapsedMs < PREMATURE_BROKER_EXIT_MS && exitCode === 0;
}

/**
 * Discovers an installed Chromium/Edge desktop runtime capable of `--app=<url>`.
 */
export function findDesktopBrowserExecutable(
  env: Readonly<Record<string, string | undefined>> = process.env,
): DesktopBrowserCandidate | null {
  const override = env.TEXPULSE_DESKTOP_BROWSER?.trim();
  if (override && existsSync(override)) {
    return { executable: override, kind: "chromium" };
  }

  if (process.platform === "win32") {
    const progX86 = env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
    const prog = env.ProgramFiles ?? "C:\\Program Files";
    const localApp = env.LOCALAPPDATA ?? "";

    const candidates: DesktopBrowserCandidate[] = [
      { executable: join(progX86, "Microsoft", "Edge", "Application", "msedge.exe"), kind: "msedge" },
      { executable: join(prog, "Microsoft", "Edge", "Application", "msedge.exe"), kind: "msedge" },
      ...(localApp
        ? [{ executable: join(localApp, "Microsoft", "Edge", "Application", "msedge.exe"), kind: "msedge" as const }]
        : []),
      { executable: join(prog, "Google", "Chrome", "Application", "chrome.exe"), kind: "chrome" },
      { executable: join(progX86, "Google", "Chrome", "Application", "chrome.exe"), kind: "chrome" },
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate.executable)) return candidate;
    }
    return null;
  }

  if (process.platform === "darwin") {
    const macCandidates: DesktopBrowserCandidate[] = [
      { executable: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", kind: "msedge" },
      { executable: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", kind: "chrome" },
    ];
    return macCandidates.find((c) => existsSync(c.executable)) ?? null;
  }

  const linuxCandidates: DesktopBrowserCandidate[] = [
    { executable: "/usr/bin/microsoft-edge", kind: "msedge" },
    { executable: "/usr/bin/google-chrome", kind: "chrome" },
    { executable: "/usr/bin/chromium", kind: "chromium" },
    { executable: "/usr/bin/chromium-browser", kind: "chromium" },
  ];
  return linuxCandidates.find((c) => existsSync(c.executable)) ?? null;
}

function parseCliPort(argv: readonly string[]): number {
  const portFlag = argv.find((a) => a.startsWith("--port="));
  if (portFlag) {
    const parsed = Number(portFlag.slice("--port=".length));
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 65535) {
      return parsed;
    }
  }
  const envPort = process.env.TEXPULSE_PORT;
  if (envPort !== undefined) {
    const parsed = Number(envPort);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 65535) {
      return parsed;
    }
  }
  return 0;
}

async function runDesktopLauncher(): Promise<void> {
  const argv = process.argv.slice(2);
  const smokeTest = argv.includes("--smoke-test");
  const headlessOnly = argv.includes("--headless");
  const requestedPort = parseCliPort(argv);
  const projectDir = process.env.TEXPULSE_PROJECT_DIR;

  if (!existsSync(resolve(DEFAULT_CLIENT_DIST, "index.html"))) {
    throw new Error(
      `Client production bundle missing at ${DEFAULT_CLIENT_DIST}. Run "pnpm build" first.`,
    );
  }

  let browserChild: ChildProcess | null = null;
  let cleanedUp = false;
  let server: Awaited<ReturnType<typeof startLocalServer>> | null = null;

  const cleanup = async (): Promise<void> => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (browserChild && !browserChild.killed) {
      browserChild.kill();
    }
    if (server && server.listening) {
      await new Promise<void>((resolveClose) => {
        server!.close(() => resolveClose());
        server!.closeAllConnections?.();
      });
    }
  };

  server = await startLocalServer(projectDir, requestedPort, {
    serveClient: true,
    clientDistDir: DEFAULT_CLIENT_DIST,
    onDesktopShutdown: () => {
      void cleanup().then(() => process.exit(0));
    },
  });

  const addr = server.address() as AddressInfo | null;
  const boundPort = addr?.port ?? requestedPort;
  const appUrl = `http://127.0.0.1:${String(boundPort)}/`;
  const browserCandidate = findDesktopBrowserExecutable();
  const profileDir = getDesktopProfileDir();

  if (smokeTest) {
    try {
      const [indexRes, healthRes] = await Promise.all([
        fetch(appUrl),
        fetch(`http://127.0.0.1:${String(boundPort)}/api/health`),
      ]);
      const indexHtml = await indexRes.text();
      const healthJson = (await healthRes.json()) as { ok?: boolean; version?: string };

      if (!indexRes.ok || !indexHtml.includes("<div id=\"root\">")) {
        throw new Error(`SPA smoke check failed with status ${String(indexRes.status)}.`);
      }
      if (!healthRes.ok || !healthJson.ok) {
        throw new Error(`API health smoke check failed with status ${String(healthRes.status)}.`);
      }

      console.log(
        JSON.stringify({
          ok: true,
          mode: "desktop-smoke-test",
          url: appUrl,
          spaStatus: indexRes.status,
          apiStatus: healthRes.status,
          apiHealthOk: healthJson.ok,
          desktopShell: browserCandidate?.kind ?? "system-browser-fallback",
          executable: browserCandidate?.executable ?? null,
          profileDir,
        }),
      );
    } finally {
      await cleanup();
    }
    return;
  }

  process.on("SIGINT", () => {
    void cleanup().then(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    void cleanup().then(() => process.exit(0));
  });

  console.log(`TeXPulse Studio 2.0 desktop server ready at ${appUrl}`);

  if (!headlessOnly && browserCandidate !== null) {
    await mkdir(profileDir, { recursive: true });
    const spawnedAt = Date.now();
    browserChild = spawn(
      browserCandidate.executable,
      buildDesktopBrowserArgs(appUrl, profileDir),
      { stdio: "ignore" },
    );

    browserChild.on("close", (code) => {
      const elapsedMs = Date.now() - spawnedAt;
      if (shouldKeepServerAliveOnBrowserExit(elapsedMs, code)) {
        console.log(
          `Browser process exited in ${String(elapsedMs)}ms (code 0); window attached to an existing browser broker. Keeping server alive at ${appUrl} until SIGINT/SIGTERM or POST /api/desktop/shutdown.`,
        );
        return;
      }
      void cleanup().then(() => process.exit(0));
    });
    browserChild.on("error", () => {
      console.log(`Unable to spawn ${browserCandidate.executable}; open ${appUrl} manually.`);
    });
  } else {
    console.log(
      headlessOnly
        ? `Running headless desktop server at ${appUrl}`
        : `No Edge/Chrome binary detected; open ${appUrl} in your browser.`,
    );
  }
}

if (process.argv[1] !== undefined && resolve(THIS_FILE) === resolve(process.argv[1])) {
  runDesktopLauncher().catch((err: unknown) => {
    console.error("TeXPulse Desktop Launcher failed:", err);
    process.exitCode = 1;
  });
}
