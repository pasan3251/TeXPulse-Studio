import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  session,
} from "electron/main";
import { shell } from "electron";

import { MiktexCompilerAdapter } from "../compiler/compiler-adapter.js";
import { PROJECT_EVENTS } from "../ipc/channels.js";
import { registerProjectIpc } from "./project-ipc.js";
import { createSecureWindowOptions } from "./window-options.js";
import { SynctexService } from "../synctex/synctex-service.js";
import { GlobalSettingsStore } from "../settings/global-settings.js";
import { defaultGlobalSettings } from "../settings/settings-types.js";
import { runDoctor } from "../toolchain/doctor.js";
import type {
  ToolchainCheckRequest,
  ToolchainReport,
} from "../ipc/settings-contracts.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | null = null;
let disposeProjectIpc: (() => void) | null = null;

app.enableSandbox();

void app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  configurePermissionPolicy();

  const preloadPath = join(currentDirectory, "preload.cjs");
  const settingsStore = new GlobalSettingsStore(
    !app.isPackaged && process.env.TEXPULSE_E2E_USER_DATA !== undefined
      ? process.env.TEXPULSE_E2E_USER_DATA
      : app.getPath("userData"),
  );
  mainWindow = new BrowserWindow(
    createSecureWindowOptions(
      preloadPath,
      !app.isPackaged && process.env.NODE_ENV !== "production",
    ),
  );
  hardenNavigation(mainWindow);

  disposeProjectIpc = registerProjectIpc({
    createCompilerAdapter,
    createSynctexService,
    ipcMain,
    openPath: (path) => shell.openPath(path),
    notifyProjectFileChange: (change) => {
      mainWindow?.webContents.send(PROJECT_EVENTS.fileChanged, change);
    },
    showItemInFolder: (path) => {
      shell.showItemInFolder(path);
    },
    trustedWebContentsId: () => mainWindow?.webContents.id ?? null,
    loadGlobalSettings: async () => {
      const loaded = await settingsStore.load();
      if (!app.isPackaged && process.env.TEXPULSE_E2E_FORCE_SETUP === "1") {
        return {
          settings: { ...defaultGlobalSettings(), setupCompleted: false },
          issues: loaded.issues,
        };
      }
      if (!app.isPackaged && process.env.TEXPULSE_E2E_PROJECT !== undefined) {
        return {
          settings: { ...loaded.settings, setupCompleted: true },
          issues: loaded.issues,
        };
      }
      return loaded;
    },
    saveGlobalSettings: (settings) => settingsStore.save(settings),
    checkToolchain,
    selectProjectDirectory: async () => {
      const e2eProject = process.env.TEXPULSE_E2E_PROJECT;
      if (!app.isPackaged && e2eProject !== undefined) {
        return e2eProject;
      }

      if (mainWindow === null) {
        return null;
      }
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ["openDirectory"],
        title: "Open LaTeX project",
      });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });
  mainWindow.on("closed", () => {
    disposeProjectIpc?.();
    disposeProjectIpc = null;
    mainWindow = null;
  });

  await mainWindow.loadFile(
    join(currentDirectory, "..", "renderer", "index.html"),
  );
});

app.on("window-all-closed", () => {
  app.quit();
});

function createCompilerAdapter(): MiktexCompilerAdapter {
  const e2eNode = process.env.TEXPULSE_E2E_NODE;
  const e2eLatexmk = process.env.TEXPULSE_E2E_LATEXMK;
  if (!app.isPackaged && e2eNode !== undefined && e2eLatexmk !== undefined) {
    return new MiktexCompilerAdapter({
      latexmkCommand: {
        executable: e2eNode,
        prefixArgs: [e2eLatexmk],
      },
      engineExecutable: e2eNode,
    });
  }
  return new MiktexCompilerAdapter();
}

function createSynctexService(): SynctexService {
  const e2eNode = process.env.TEXPULSE_E2E_NODE;
  const e2eSynctex = process.env.TEXPULSE_E2E_SYNCTEX;
  if (!app.isPackaged && e2eNode !== undefined && e2eSynctex !== undefined) {
    return new SynctexService({
      command: {
        executable: e2eNode,
        prefixArgs: [e2eSynctex],
      },
    });
  }
  return new SynctexService();
}

async function checkToolchain(
  request: ToolchainCheckRequest,
): Promise<ToolchainReport> {
  if (
    !app.isPackaged &&
    process.env.TEXPULSE_E2E_LATEXMK !== undefined &&
    process.env.TEXPULSE_E2E_NODE !== undefined
  ) {
    return {
      ready: true,
      tools: [
        "latexmk",
        "pdflatex",
        "xelatex",
        "lualatex",
        "bibtex",
        "biber",
        "makeindex",
        "synctex",
      ].map((id) => ({
        id: id as ToolchainReport["tools"][number]["id"],
        label: id,
        state: "available" as const,
        path: process.execPath,
        version: "e2e",
        exitCode: 0,
        detail: null,
      })),
      issues: [],
      selfTest: {
        status: request.skipSelfTest === true ? "skipped" : "passed",
        message:
          request.skipSelfTest === true
            ? "Compile self-test was explicitly skipped."
            : "Real compile self-test succeeded.",
      },
    };
  }

  const report = await runDoctor({
    fixturePath: join(
      currentDirectory,
      "..",
      "..",
      "fixtures",
      "minimal-success",
      "main.tex",
    ),
    ...(request.customBinDirectory === null
      ? {}
      : { customBinDirectory: request.customBinDirectory }),
    ...(request.skipSelfTest === undefined
      ? {}
      : { skipSelfTest: request.skipSelfTest }),
  });
  return {
    ready: report.ready,
    tools: report.probe.tools,
    issues: report.probe.issues,
    selfTest: {
      status: report.selfTest.status,
      message: report.selfTest.message,
    },
  };
}

function configurePermissionPolicy(): void {
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false);
    },
  );
}

function hardenNavigation(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
  window.webContents.on("will-navigate", (event, targetUrl) => {
    if (targetUrl !== window.webContents.getURL()) {
      event.preventDefault();
    }
  });
}
