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
import { registerProjectIpc } from "./project-ipc.js";
import { createSecureWindowOptions } from "./window-options.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | null = null;
let disposeProjectIpc: (() => void) | null = null;

app.enableSandbox();

void app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  configurePermissionPolicy();

  const preloadPath = join(currentDirectory, "preload.cjs");
  mainWindow = new BrowserWindow(
    createSecureWindowOptions(
      preloadPath,
      !app.isPackaged && process.env.NODE_ENV !== "production",
    ),
  );
  hardenNavigation(mainWindow);

  disposeProjectIpc = registerProjectIpc({
    createCompilerAdapter,
    ipcMain,
    openPath: (path) => shell.openPath(path),
    showItemInFolder: (path) => {
      shell.showItemInFolder(path);
    },
    trustedWebContentsId: () => mainWindow?.webContents.id ?? null,
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
