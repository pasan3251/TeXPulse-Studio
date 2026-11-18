import { existsSync } from "node:fs";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findDesktopBrowserExecutable } from "./desktop-launcher.js";

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(THIS_FILE), "../../..");
const DIST_DESKTOP_DIR = resolve(REPO_ROOT, "dist/desktop");
const CLIENT_DIST_INDEX = resolve(REPO_ROOT, "packages/client/dist/index.html");
const LAUNCHER_DIST_ENTRY = resolve(REPO_ROOT, "packages/server/dist/desktop-launcher.js");

async function buildPortableDesktopBundle(): Promise<void> {
  if (!existsSync(CLIENT_DIST_INDEX) || !existsSync(LAUNCHER_DIST_ENTRY)) {
    throw new Error(
      'Built artifacts not found. Run "pnpm build" before "pnpm desktop:package".',
    );
  }

  await mkdir(DIST_DESKTOP_DIR, { recursive: true });

  const windowsLauncher = [
    "@echo off",
    "setlocal",
    'if "%~1"=="" (',
    '  node "%~dp0..\\..\\packages\\server\\dist\\desktop-launcher.js"',
    ") else (",
    '  node "%~dp0..\\..\\packages\\server\\dist\\desktop-launcher.js" "%~1" %2 %3 %4 %5',
    ")",
    "",
  ].join("\r\n");

  const windowsServerLauncher = [
    "@echo off",
    "setlocal",
    'node "%~dp0..\\..\\packages\\server\\dist\\index.js" --serve-client %*',
    "",
  ].join("\r\n");

  const posixLauncher = [
    "#!/usr/bin/env sh",
    'set -eu',
    'ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"',
    'exec node "$ROOT_DIR/packages/server/dist/desktop-launcher.js" "$@"',
    "",
  ].join("\n");

  const browser = findDesktopBrowserExecutable();
  const manifest = {
    name: "TeXPulse Studio",
    version: "2.0.0",
    architecture: "single-port-desktop-shell",
    defaultPort: 4317,
    detectedDesktopRuntime: browser?.kind ?? "system-browser-fallback",
    entry: "packages/server/dist/desktop-launcher.js",
    clientDist: "packages/client/dist",
    launchers: {
      windowsDesktop: "dist/desktop/Launch-TeXPulse-Studio.cmd",
      windowsServer: "dist/desktop/Launch-TeXPulse-Server.cmd",
      posixDesktop: "dist/desktop/Launch-TeXPulse-Studio.sh",
    },
    generatedAt: new Date().toISOString(),
  };

  await writeFile(resolve(DIST_DESKTOP_DIR, "Launch-TeXPulse-Studio.cmd"), windowsLauncher, "utf8");
  await writeFile(resolve(DIST_DESKTOP_DIR, "Launch-TeXPulse-Server.cmd"), windowsServerLauncher, "utf8");
  const shPath = resolve(DIST_DESKTOP_DIR, "Launch-TeXPulse-Studio.sh");
  await writeFile(shPath, posixLauncher, "utf8");
  await chmod(shPath, 0o755).catch(() => undefined);
  await writeFile(
    resolve(DIST_DESKTOP_DIR, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  console.log(
    JSON.stringify({
      ok: true,
      outputDir: DIST_DESKTOP_DIR,
      manifest: manifest.launchers,
      detectedDesktopRuntime: manifest.detectedDesktopRuntime,
    }),
  );
}

buildPortableDesktopBundle().catch((err: unknown) => {
  console.error("Failed to package TeXPulse desktop bundle:", err);
  process.exitCode = 1;
});
