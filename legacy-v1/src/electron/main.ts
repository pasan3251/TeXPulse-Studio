import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { basename, dirname, extname, join } from "node:path";

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
import { RecoveryStore } from "../recovery/recovery-store.js";
import { ApplicationLog } from "../support/application-log.js";
import { ensureSampleProject } from "../project/sample-project.js";
import { createProjectFromTemplate } from "../project/sample-project.js";
import { RecentProjectsStore } from "../project/recent-projects.js";
import {
  isAllowedRendererNavigation,
  isExternalUrl,
} from "./navigation-policy.js";
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
  const userDataDirectory =
    !app.isPackaged && process.env.TEXPULSE_E2E_USER_DATA !== undefined
      ? process.env.TEXPULSE_E2E_USER_DATA
      : app.getPath("userData");
  const settingsStore = new GlobalSettingsStore(userDataDirectory);
  const recoveryStore = new RecoveryStore(userDataDirectory);
  const applicationLog = new ApplicationLog(userDataDirectory);
  const recentProjectsStore = new RecentProjectsStore(
    join(userDataDirectory, "recent-projects.json"),
  );
  applicationLog.record("info", "application_started", {
    packaged: app.isPackaged,
    version: app.getVersion(),
  });
  mainWindow = new BrowserWindow(
    createSecureWindowOptions(
      preloadPath,
      !app.isPackaged && process.env.NODE_ENV !== "production",
    ),
  );
  hardenNavigation(mainWindow, (event, targetUrl) => {
    applicationLog.record("warn", event, {
      targetScheme: urlScheme(targetUrl),
    });
  });

  disposeProjectIpc = registerProjectIpc({
    createProjectDirectory: async () => {
      const e2eProject = process.env.TEXPULSE_E2E_NEW_PROJECT;
      let targetPath =
        !app.isPackaged && e2eProject !== undefined ? e2eProject : null;
      if (targetPath === null) {
        if (mainWindow === null) {
          return null;
        }
        const result = await dialog.showSaveDialog(mainWindow, {
          defaultPath: join(app.getPath("documents"), "TeXPulse Project"),
          title: "Create LaTeX project",
        });
        targetPath = result.canceled ? null : result.filePath;
      }
      if (targetPath === null) {
        return null;
      }
      return createProjectFromTemplate(
        applicationResourcePath("sample-project"),
        targetPath,
      );
    },
    createCompilerAdapter,
    createSynctexService,
    ipcMain,
    clearLocalData: async () => {
      const recoverySnapshots = await recoveryStore.clearAll();
      await applicationLog.clear();
      return { recoverySnapshots };
    },
    clearRecovery: (projectId) => recoveryStore.clear(projectId),
    loadRecovery: (projectId) => recoveryStore.load(projectId),
    saveRecovery: (request) => recoveryStore.save(request),
    exportSupportLog: async (redactionPaths) => {
      const e2ePath = process.env.TEXPULSE_E2E_SUPPORT_LOG;
      let exportPath =
        !app.isPackaged && e2ePath !== undefined ? e2ePath : null;
      if (exportPath === null) {
        if (mainWindow === null) {
          return false;
        }
        const result = await dialog.showSaveDialog(mainWindow, {
          defaultPath: "texpulse-support-log.txt",
          filters: [{ name: "Text files", extensions: ["txt"] }],
          title: "Export TeXPulse Studio support log",
        });
        exportPath = result.canceled ? null : result.filePath;
      }
      if (exportPath === null) {
        return false;
      }
      await applicationLog.exportTo(exportPath, redactionPaths);
      return true;
    },
    logEvent: (level, event, details) => {
      applicationLog.record(level, event, details);
    },
    openPath: (path) => shell.openPath(path),
    notifyProjectFileChange: (change) => {
      mainWindow?.webContents.send(PROJECT_EVENTS.fileChanged, change);
    },
    prepareSampleProject: () =>
      ensureSampleProject(
        applicationResourcePath("sample-project"),
        join(userDataDirectory, "sample-project"),
      ),
    loadRecentProjects: async () => {
      const loaded = await recentProjectsStore.load();
      return loaded.projects.map((project) => ({
        id: recentProjectId(project.path),
        name: basename(project.path),
        displayPath: basename(project.path),
        lastOpenedAt: project.lastOpenedAt,
      }));
    },
    recordRecentProject: async (path) => {
      await recentProjectsStore.add(path);
    },
    resolveRecentProject: async (id) => {
      const loaded = await recentProjectsStore.load();
      return (
        loaded.projects.find((project) => recentProjectId(project.path) === id)
          ?.path ?? null
      );
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
      return { settings: loaded.settings, issues: loaded.issues };
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
    selectProjectExportPath: async (projectName) => {
      const e2ePath = process.env.TEXPULSE_E2E_EXPORT_PATH;
      if (!app.isPackaged && e2ePath !== undefined) {
        return e2ePath;
      }
      if (mainWindow === null) {
        return null;
      }
      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: `${projectName}.zip`,
        filters: [{ name: "ZIP archives", extensions: ["zip"] }],
        title: "Export LaTeX project",
      });
      if (result.canceled || result.filePath === undefined) {
        return null;
      }
      return extname(result.filePath).toLowerCase() === ".zip"
        ? result.filePath
        : `${result.filePath}.zip`;
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
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    applicationLog.record("error", "render_process_gone", {
      exitCode: details.exitCode,
      reason: details.reason,
    });
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
    fixturePath: applicationResourcePath("sample-project", "main.tex"),
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

function applicationResourcePath(...segments: string[]): string {
  const root = app.isPackaged
    ? process.resourcesPath
    : join(currentDirectory, "..", "..", "resources");
  return join(root, ...segments);
}

function configurePermissionPolicy(): void {
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false);
    },
  );
}

function hardenNavigation(
  window: BrowserWindow,
  recordRejection: (event: string, targetUrl: string) => void,
): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    recordRejection(
      isExternalUrl(url) ? "external_window_rejected" : "window_rejected",
      url,
    );
    return { action: "deny" };
  });
  window.webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
  window.webContents.on("will-navigate", (event, targetUrl) => {
    if (!isAllowedRendererNavigation(window.webContents.getURL(), targetUrl)) {
      event.preventDefault();
      recordRejection(
        isExternalUrl(targetUrl)
          ? "external_navigation_rejected"
          : "navigation_rejected",
        targetUrl,
      );
    }
  });
}

function urlScheme(targetUrl: string): string {
  try {
    return new URL(targetUrl).protocol;
  } catch {
    return "invalid";
  }
}

function recentProjectId(path: string): string {
  const key =
    process.platform === "win32" ? path.toLocaleLowerCase("en-US") : path;
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}
