import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { IpcMain, IpcMainInvokeEvent } from "electron/main";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MiktexCompilerAdapter } from "../../src/compiler/compiler-adapter.js";
import { registerProjectIpc } from "../../src/electron/project-ipc.js";
import { RecoveryStoreError } from "../../src/recovery/recovery-store.js";
import {
  ALL_CHANNELS,
  BUILD_CHANNELS,
  RECOVERY_CHANNELS,
  SETTINGS_CHANNELS,
  SUPPORT_CHANNELS,
  SYNCTEX_CHANNELS,
} from "../../src/ipc/channels.js";
import { PROJECT_CHANNELS } from "../../src/ipc/project-contracts.js";
import type { GlobalSettings } from "../../src/settings/settings-types.js";

type IpcHandler = Parameters<IpcMain["handle"]>[1];

const temporaryDirectories: string[] = [];
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const fakeLatexmk = join(currentDirectory, "fixtures", "fake-latexmk.mjs");

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function createProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "texpulse-ipc-"));
  temporaryDirectories.push(root);
  await writeFile(join(root, "main.tex"), "\\documentclass{article}");
  return root;
}

function createFakeIpcMain() {
  const handlers = new Map<string, IpcHandler>();
  const ipcMain = {
    handle(channel: string, listener: IpcHandler) {
      handlers.set(channel, listener);
    },
    removeHandler(channel: string) {
      handlers.delete(channel);
    },
  } satisfies Pick<IpcMain, "handle" | "removeHandler">;
  return { handlers, ipcMain };
}

function event(senderId: number, mainFrame = true): IpcMainInvokeEvent {
  const frame = {};
  const senderFrame = mainFrame ? frame : {};
  return {
    sender: { id: senderId, mainFrame: frame },
    senderFrame,
  } as unknown as IpcMainInvokeEvent;
}

async function invoke(
  handlers: Map<string, IpcHandler>,
  channel: string,
  ipcEvent: IpcMainInvokeEvent,
  payload?: unknown,
): Promise<unknown> {
  const handler = handlers.get(channel);
  if (handler === undefined) {
    throw new Error(`Missing fake IPC handler: ${channel}`);
  }
  return handler(ipcEvent, payload);
}

describe("project IPC", () => {
  it("reports unavailable project operations before a project is open", async () => {
    const { handlers, ipcMain } = createFakeIpcMain();
    registerProjectIpc({
      ipcMain,
      selectProjectDirectory: () => Promise.resolve(null),
      trustedWebContentsId: () => 7,
    });

    const requests = [
      [
        PROJECT_CHANNELS.copyEntry,
        { sourcePath: "main.tex", destinationPath: "main copy.tex" },
      ],
      [PROJECT_CHANNELS.createDirectory, { path: "chapters" }],
      [
        PROJECT_CHANNELS.createTextFile,
        { path: "chapters/intro.tex", content: "" },
      ],
      [
        PROJECT_CHANNELS.renameEntry,
        {
          sourcePath: "main.tex",
          destinationPath: "paper.tex",
        },
      ],
      [PROJECT_CHANNELS.deleteEntry, { path: "main.tex", recursive: false }],
      [PROJECT_CHANNELS.exportZip, undefined],
      [PROJECT_CHANNELS.getGitStatus, undefined],
      [PROJECT_CHANNELS.readTextFile, { path: "main.tex" }],
      [PROJECT_CHANNELS.revealEntry, { path: "main.tex" }],
      [
        PROJECT_CHANNELS.writeTextFile,
        {
          path: "main.tex",
          content: "content",
          expectedVersion: "a".repeat(64),
        },
      ],
      [BUILD_CHANNELS.compile, { rootFile: "main.tex" }],
      [BUILD_CHANNELS.clean, { rootFile: "main.tex" }],
      [BUILD_CHANNELS.cleanupAuxiliary, undefined],
      [BUILD_CHANNELS.cancel, undefined],
      [BUILD_CHANNELS.loadPdf, { buildId: "build-1", generation: 1 }],
      [BUILD_CHANNELS.openPdf, { buildId: "build-1", generation: 1 }],
      [BUILD_CHANNELS.revealPdf, { buildId: "build-1", generation: 1 }],
      [RECOVERY_CHANNELS.getRecovery, undefined],
      [RECOVERY_CHANNELS.clearRecovery, undefined],
      [
        RECOVERY_CHANNELS.saveRecovery,
        {
          projectId: "a".repeat(16),
          buffers: [
            {
              path: "main.tex",
              content: "unsaved",
              version: "a".repeat(64),
            },
          ],
        },
      ],
      [
        SYNCTEX_CHANNELS.forward,
        {
          buildId: "build-1",
          generation: 1,
          path: "main.tex",
          line: 1,
          column: 1,
        },
      ],
      [
        SETTINGS_CHANNELS.saveProject,
        {
          rootFile: "main.tex",
          recipe: "latexmk-pdf",
          buildDirectory: ".texpulse/build",
          autoBuild: true,
          allowLatexmkRc: false,
        },
      ],
      [
        SYNCTEX_CHANNELS.inverse,
        {
          buildId: "build-1",
          generation: 1,
          page: 1,
          x: 10,
          y: 20,
        },
      ],
    ] as const;

    for (const [channel, payload] of requests) {
      await expect(
        invoke(handlers, channel, event(7), payload),
      ).resolves.toMatchObject({
        ok: false,
        error: { code: "no-project" },
      });
    }
    await expect(
      invoke(handlers, PROJECT_CHANNELS.open, event(7)),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "cancelled" },
    });
    await expect(
      invoke(handlers, PROJECT_CHANNELS.create, event(7)),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "project-create-failed" },
    });
    await expect(
      invoke(handlers, PROJECT_CHANNELS.getRecent, event(7)),
    ).resolves.toEqual({ ok: true, value: [] });
    await expect(
      invoke(handlers, PROJECT_CHANNELS.openRecent, event(7), {
        id: "a".repeat(16),
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "not-found" },
    });
  });

  it("loads and saves global settings and reports toolchain readiness", async () => {
    const { handlers, ipcMain } = createFakeIpcMain();
    registerProjectIpc({
      ipcMain,
      selectProjectDirectory: () => Promise.resolve(null),
      trustedWebContentsId: () => 7,
      checkToolchain: () =>
        Promise.resolve({
          ready: false,
          tools: [],
          issues: [
            {
              severity: "error",
              tool: "latexmk",
              message: "latexmk was not found.",
            },
          ],
          selfTest: {
            status: "failed",
            message: "Required tools are unavailable.",
          },
        }),
    });

    const loaded = (await invoke(
      handlers,
      SETTINGS_CHANNELS.get,
      event(7),
    )) as { value: { settings: { setupCompleted: boolean } } };
    expect(loaded.value.settings.setupCompleted).toBe(false);

    await expect(
      invoke(handlers, SETTINGS_CHANNELS.saveGlobal, event(7), {
        ...loaded.value.settings,
        setupCompleted: true,
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: { setupCompleted: true },
    });
    await expect(
      invoke(handlers, SETTINGS_CHANNELS.toolchainCheck, event(7), {
        customBinDirectory: null,
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        ready: false,
        selfTest: { status: "failed" },
      },
    });
  });

  it("reports an unavailable toolchain-check service honestly", async () => {
    const { handlers, ipcMain } = createFakeIpcMain();
    registerProjectIpc({
      ipcMain,
      selectProjectDirectory: () => Promise.resolve(null),
      trustedWebContentsId: () => 7,
    });

    await expect(
      invoke(handlers, SETTINGS_CHANNELS.toolchainCheck, event(7), {
        customBinDirectory: null,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "internal",
        message: expect.stringContaining("unavailable"),
      },
    });
  });

  it("delegates global settings persistence to the application store", async () => {
    const { handlers, ipcMain } = createFakeIpcMain();
    const settings: GlobalSettings = {
      schemaVersion: 1,
      theme: "system",
      autosave: true,
      autoBuild: true,
      debounceMs: 800,
      compileTimeoutMs: 120_000,
      customBinDirectory: null,
      editorFontSize: 15,
      pdfZoomMode: "fit-width",
      setupCompleted: false,
    };
    const loadGlobalSettings = vi.fn(() =>
      Promise.resolve({ settings, issues: ["Recovered."] }),
    );
    const saveGlobalSettings = vi.fn((value: GlobalSettings) =>
      Promise.resolve(value),
    );
    registerProjectIpc({
      ipcMain,
      loadGlobalSettings,
      saveGlobalSettings,
      selectProjectDirectory: () => Promise.resolve(null),
      trustedWebContentsId: () => 7,
    });

    await expect(
      invoke(handlers, SETTINGS_CHANNELS.get, event(7)),
    ).resolves.toMatchObject({
      ok: true,
      value: { issues: ["Recovered."] },
    });
    await expect(
      invoke(handlers, SETTINGS_CHANNELS.saveGlobal, event(7), {
        ...settings,
        setupCompleted: true,
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: { setupCompleted: true },
    });
    expect(loadGlobalSettings).toHaveBeenCalledOnce();
    expect(saveGlobalSettings).toHaveBeenCalledOnce();
  });

  it("opens a project and reads only through the active bounded session", async () => {
    const root = await createProject();
    const { handlers, ipcMain } = createFakeIpcMain();
    registerProjectIpc({
      ipcMain,
      selectProjectDirectory: () => Promise.resolve(root),
      trustedWebContentsId: () => 7,
    });

    await expect(
      invoke(handlers, PROJECT_CHANNELS.open, event(7)),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        name: expect.any(String),
        entries: [{ path: "main.tex", kind: "file" }],
      },
    });
    const read = await invoke(
      handlers,
      PROJECT_CHANNELS.readTextFile,
      event(7),
      {
        path: "main.tex",
      },
    );
    expect(read).toMatchObject({
      ok: true,
      value: { path: "main.tex", content: "\\documentclass{article}" },
    });
    await expect(
      invoke(handlers, PROJECT_CHANNELS.getGitStatus, event(7)),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        state: "not-a-repository",
        hasChanges: false,
      },
    });
    await expect(
      invoke(handlers, PROJECT_CHANNELS.writeTextFile, event(7), {
        path: "main.tex",
        content: "\\documentclass{article}\n% saved",
        expectedVersion: (read as { value: { version: string } }).value.version,
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: { content: "\\documentclass{article}\n% saved" },
    });
    await expect(
      invoke(handlers, PROJECT_CHANNELS.readTextFile, event(7), {
        path: "../outside.tex",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "path-escape" },
    });
  });

  it("opens only the fixed prepared sample project", async () => {
    const root = await createProject();
    const { handlers, ipcMain } = createFakeIpcMain();
    const prepareSampleProject = vi.fn(() => Promise.resolve(root));
    const selectProjectDirectory = vi.fn(() => Promise.resolve(null));
    registerProjectIpc({
      ipcMain,
      prepareSampleProject,
      selectProjectDirectory,
      trustedWebContentsId: () => 7,
    });

    await expect(
      invoke(handlers, PROJECT_CHANNELS.openSample, event(7)),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        entries: [{ path: "main.tex", kind: "file" }],
        rootFile: "main.tex",
      },
    });
    expect(prepareSampleProject).toHaveBeenCalledOnce();
    expect(selectProjectDirectory).not.toHaveBeenCalled();
  });

  it("creates a project through a fixed main-process destination", async () => {
    const root = await createProject();
    const { handlers, ipcMain } = createFakeIpcMain();
    const createProjectDirectory = vi.fn(() => Promise.resolve(root));
    const recordRecentProject = vi.fn(() => Promise.resolve());
    registerProjectIpc({
      createProjectDirectory,
      ipcMain,
      recordRecentProject,
      selectProjectDirectory: () => Promise.resolve(null),
      trustedWebContentsId: () => 7,
    });

    await expect(
      invoke(handlers, PROJECT_CHANNELS.create, event(7)),
    ).resolves.toMatchObject({
      ok: true,
      value: { rootFile: "main.tex" },
    });
    expect(createProjectDirectory).toHaveBeenCalledOnce();
    expect(recordRecentProject).toHaveBeenCalledWith(root);
  });

  it("reports project creation cancellation and preparation failures", async () => {
    const cancelled = createFakeIpcMain();
    registerProjectIpc({
      createProjectDirectory: () => Promise.resolve(null),
      ipcMain: cancelled.ipcMain,
      selectProjectDirectory: () => Promise.resolve(null),
      trustedWebContentsId: () => 7,
    });
    await expect(
      invoke(cancelled.handlers, PROJECT_CHANNELS.create, event(7)),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "cancelled" },
    });

    const failed = createFakeIpcMain();
    registerProjectIpc({
      createProjectDirectory: () =>
        Promise.reject(new Error("Template copy failed.")),
      ipcMain: failed.ipcMain,
      selectProjectDirectory: () => Promise.resolve(null),
      trustedWebContentsId: () => 7,
    });
    await expect(
      invoke(failed.handlers, PROJECT_CHANNELS.create, event(7)),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "project-create-failed",
        message: "Template copy failed.",
      },
    });
  });

  it("opens recent projects and performs validated project mutations and export", async () => {
    const root = await createProject();
    const canonicalRoot = await realpath(root);
    const exportDirectory = await mkdtemp(join(tmpdir(), "texpulse-export-"));
    temporaryDirectories.push(exportDirectory);
    const exportPath = join(exportDirectory, "project.zip");
    const { handlers, ipcMain } = createFakeIpcMain();
    const openPath = vi.fn(() => Promise.resolve(""));
    const showItemInFolder = vi.fn();
    registerProjectIpc({
      ipcMain,
      loadRecentProjects: () =>
        Promise.resolve([
          {
            id: "a".repeat(16),
            name: "paper",
            displayPath: root,
            lastOpenedAt: "2026-06-14T00:00:00.000Z",
          },
        ]),
      resolveRecentProject: (id) =>
        Promise.resolve(id === "a".repeat(16) ? root : null),
      selectProjectDirectory: () => Promise.resolve(null),
      selectProjectExportPath: () => Promise.resolve(exportPath),
      openPath,
      showItemInFolder,
      trustedWebContentsId: () => 7,
    });

    await expect(
      invoke(handlers, PROJECT_CHANNELS.getRecent, event(7)),
    ).resolves.toMatchObject({
      ok: true,
      value: [{ id: "a".repeat(16), name: "paper" }],
    });
    await invoke(handlers, PROJECT_CHANNELS.openRecent, event(7), {
      id: "a".repeat(16),
    });
    await expect(
      invoke(handlers, PROJECT_CHANNELS.createDirectory, event(7), {
        path: "chapters",
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        entries: expect.arrayContaining([
          expect.objectContaining({ path: "chapters" }),
        ]),
      },
    });
    await invoke(handlers, PROJECT_CHANNELS.createTextFile, event(7), {
      path: "chapters/intro.tex",
      content: "Intro",
    });
    await expect(
      invoke(handlers, PROJECT_CHANNELS.copyEntry, event(7), {
        sourcePath: "chapters/intro.tex",
        destinationPath: "chapters/intro copy.tex",
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        entries: expect.arrayContaining([
          expect.objectContaining({ path: "chapters/intro copy.tex" }),
        ]),
      },
    });
    await expect(
      invoke(handlers, PROJECT_CHANNELS.revealEntry, event(7), {
        path: "chapters/intro.tex",
      }),
    ).resolves.toEqual({ ok: true, value: undefined });
    await expect(
      invoke(handlers, PROJECT_CHANNELS.revealEntry, event(7), {
        path: "chapters",
      }),
    ).resolves.toEqual({ ok: true, value: undefined });
    expect(showItemInFolder).toHaveBeenCalledWith(
      join(canonicalRoot, "chapters", "intro.tex"),
    );
    expect(openPath).toHaveBeenCalledWith(join(canonicalRoot, "chapters"));
    const read = (await invoke(
      handlers,
      PROJECT_CHANNELS.readTextFile,
      event(7),
      { path: "chapters/intro.tex" },
    )) as { value: { version: string } };
    await expect(
      invoke(handlers, PROJECT_CHANNELS.renameEntry, event(7), {
        sourcePath: "chapters/intro.tex",
        destinationPath: "chapters/body.tex",
        expectedVersion: read.value.version,
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        entries: expect.arrayContaining([
          expect.objectContaining({ path: "chapters/body.tex" }),
        ]),
      },
    });
    await expect(
      invoke(handlers, PROJECT_CHANNELS.deleteEntry, event(7), {
        path: "chapters/body.tex",
        recursive: false,
        expectedVersion: read.value.version,
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      invoke(handlers, PROJECT_CHANNELS.exportZip, event(7)),
    ).resolves.toMatchObject({
      ok: true,
      value: { saved: true, files: 2 },
    });
    expect((await readFile(exportPath)).readUInt32LE(0)).toBe(0x04034b50);
  });

  it("reports unavailable and failed project reveal integrations", async () => {
    const root = await createProject();
    const unavailable = createFakeIpcMain();
    registerProjectIpc({
      ipcMain: unavailable.ipcMain,
      selectProjectDirectory: () => Promise.resolve(root),
      trustedWebContentsId: () => 7,
    });
    await invoke(unavailable.handlers, PROJECT_CHANNELS.open, event(7));
    await invoke(
      unavailable.handlers,
      PROJECT_CHANNELS.createDirectory,
      event(7),
      { path: "chapters" },
    );

    await expect(
      invoke(unavailable.handlers, PROJECT_CHANNELS.revealEntry, event(7), {
        path: "chapters",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "external-open-failed" },
    });
    await expect(
      invoke(unavailable.handlers, PROJECT_CHANNELS.revealEntry, event(7), {
        path: "main.tex",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "external-open-failed" },
    });

    const failed = createFakeIpcMain();
    registerProjectIpc({
      ipcMain: failed.ipcMain,
      openPath: () => Promise.resolve("Windows Explorer failed."),
      selectProjectDirectory: () => Promise.resolve(root),
      trustedWebContentsId: () => 7,
    });
    await invoke(failed.handlers, PROJECT_CHANNELS.open, event(7));
    await expect(
      invoke(failed.handlers, PROJECT_CHANNELS.revealEntry, event(7), {
        path: "chapters",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "external-open-failed",
        message: "Windows Explorer failed.",
      },
    });
  });

  it("handles recent-record failure and export unavailable, cancellation, and failure", async () => {
    const root = await createProject();
    const logEvent = vi.fn();
    const unavailable = createFakeIpcMain();
    registerProjectIpc({
      ipcMain: unavailable.ipcMain,
      logEvent,
      recordRecentProject: () =>
        Promise.reject(new Error("Recent store unavailable.")),
      selectProjectDirectory: () => Promise.resolve(root),
      trustedWebContentsId: () => 7,
    });
    await invoke(unavailable.handlers, PROJECT_CHANNELS.open, event(7));
    expect(logEvent).toHaveBeenCalledWith(
      "warn",
      "recent_project_record_failed",
      expect.objectContaining({ error: "Recent store unavailable." }),
    );
    await expect(
      invoke(unavailable.handlers, PROJECT_CHANNELS.exportZip, event(7)),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "project-export-failed" },
    });

    const cancelled = createFakeIpcMain();
    registerProjectIpc({
      ipcMain: cancelled.ipcMain,
      selectProjectDirectory: () => Promise.resolve(root),
      selectProjectExportPath: () => Promise.resolve(null),
      trustedWebContentsId: () => 7,
    });
    await invoke(cancelled.handlers, PROJECT_CHANNELS.open, event(7));
    await expect(
      invoke(cancelled.handlers, PROJECT_CHANNELS.exportZip, event(7)),
    ).resolves.toEqual({
      ok: true,
      value: {
        saved: false,
        files: 0,
        skippedLinks: 0,
        totalBytes: 0,
      },
    });

    const failed = createFakeIpcMain();
    registerProjectIpc({
      ipcMain: failed.ipcMain,
      selectProjectDirectory: () => Promise.resolve(root),
      selectProjectExportPath: () =>
        Promise.reject(new Error("Destination unavailable.")),
      trustedWebContentsId: () => 7,
    });
    await invoke(failed.handlers, PROJECT_CHANNELS.open, event(7));
    await expect(
      invoke(failed.handlers, PROJECT_CHANNELS.exportZip, event(7)),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "project-export-failed",
        message: expect.stringContaining("Destination unavailable."),
      },
    });
  });

  it("reports an unavailable sample without opening a chooser", async () => {
    const { handlers, ipcMain } = createFakeIpcMain();
    const selectProjectDirectory = vi.fn(() => Promise.resolve(null));
    registerProjectIpc({
      ipcMain,
      selectProjectDirectory,
      trustedWebContentsId: () => 7,
    });

    await expect(
      invoke(handlers, PROJECT_CHANNELS.openSample, event(7)),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "internal",
        message: expect.stringContaining("unavailable"),
      },
    });
    expect(selectProjectDirectory).not.toHaveBeenCalled();
  });

  it("persists only validated project recovery and exposes support controls", async () => {
    const root = await createProject();
    const { handlers, ipcMain } = createFakeIpcMain();
    const saveRecovery = vi.fn(
      (request: {
        projectId: string;
        buffers: {
          path: string;
          content: string;
          version: string;
        }[];
      }) =>
        Promise.resolve({
          schemaVersion: 1 as const,
          projectId: request.projectId,
          savedAt: "2026-06-14T00:00:00.000Z",
          buffers: request.buffers,
        }),
    );
    const loadRecovery = vi.fn(() => Promise.resolve(null));
    const clearRecovery = vi.fn(() => Promise.resolve(true));
    const exportSupportLog = vi.fn(() => Promise.resolve(true));
    const clearLocalData = vi.fn(() =>
      Promise.resolve({ recoverySnapshots: 1 }),
    );
    registerProjectIpc({
      clearLocalData,
      clearRecovery,
      exportSupportLog,
      ipcMain,
      loadRecovery,
      saveRecovery,
      selectProjectDirectory: () => Promise.resolve(root),
      trustedWebContentsId: () => 7,
    });

    const opened = (await invoke(
      handlers,
      PROJECT_CHANNELS.open,
      event(7),
    )) as { value: { projectId: string } };
    const read = (await invoke(
      handlers,
      PROJECT_CHANNELS.readTextFile,
      event(7),
      { path: "main.tex" },
    )) as { value: { version: string } };
    const request = {
      projectId: opened.value.projectId,
      buffers: [
        {
          path: "main.tex",
          content: "unsaved",
          version: read.value.version,
        },
      ],
    };

    await expect(
      invoke(handlers, RECOVERY_CHANNELS.saveRecovery, event(7), request),
    ).resolves.toMatchObject({ ok: true });
    expect(saveRecovery).toHaveBeenCalledWith(request);
    await expect(
      invoke(handlers, RECOVERY_CHANNELS.saveRecovery, event(7), {
        ...request,
        buffers: [{ ...request.buffers[0], path: "../outside.tex" }],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "path-escape" },
    });
    await expect(
      invoke(handlers, RECOVERY_CHANNELS.getRecovery, event(7)),
    ).resolves.toEqual({ ok: true, value: null });
    await expect(
      invoke(handlers, RECOVERY_CHANNELS.clearRecovery, event(7)),
    ).resolves.toEqual({ ok: true, value: { cleared: true } });
    await expect(
      invoke(handlers, SUPPORT_CHANNELS.exportSupportLog, event(7)),
    ).resolves.toEqual({ ok: true, value: { saved: true } });
    await expect(
      invoke(handlers, SUPPORT_CHANNELS.clearLocalData, event(7)),
    ).resolves.toEqual({
      ok: true,
      value: { recoverySnapshots: 1 },
    });
  });

  it("contains unavailable, mismatched, duplicate, and invalid recovery data", async () => {
    const root = await createProject();
    const { handlers, ipcMain } = createFakeIpcMain();
    const clearRecovery = vi.fn(() => Promise.resolve(true));
    registerProjectIpc({
      clearRecovery,
      ipcMain,
      loadRecovery: () =>
        Promise.resolve({
          schemaVersion: 1,
          projectId: "a".repeat(16),
          savedAt: "2026-06-14T00:00:00.000Z",
          buffers: [
            {
              path: "../outside.tex",
              content: "untrusted",
              version: "b".repeat(64),
            },
          ],
        }),
      selectProjectDirectory: () => Promise.resolve(root),
      trustedWebContentsId: () => 7,
    });
    const opened = (await invoke(
      handlers,
      PROJECT_CHANNELS.open,
      event(7),
    )) as { value: { projectId: string } };
    const read = (await invoke(
      handlers,
      PROJECT_CHANNELS.readTextFile,
      event(7),
      { path: "main.tex" },
    )) as { value: { version: string } };
    const buffer = {
      path: "main.tex",
      content: "unsaved",
      version: read.value.version,
    };

    await expect(
      invoke(handlers, RECOVERY_CHANNELS.saveRecovery, event(7), {
        projectId: "f".repeat(16),
        buffers: [buffer],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid-request" },
    });
    await expect(
      invoke(handlers, RECOVERY_CHANNELS.saveRecovery, event(7), {
        projectId: opened.value.projectId,
        buffers: [buffer, buffer],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid-request" },
    });
    await expect(
      invoke(handlers, RECOVERY_CHANNELS.saveRecovery, event(7), {
        projectId: opened.value.projectId,
        buffers: [buffer],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
    await expect(
      invoke(handlers, RECOVERY_CHANNELS.getRecovery, event(7)),
    ).resolves.toEqual({ ok: true, value: null });
    expect(clearRecovery).toHaveBeenCalledWith(opened.value.projectId);
    await expect(
      invoke(handlers, SUPPORT_CHANNELS.exportSupportLog, event(7)),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "support-export-failed" },
    });
    await expect(
      invoke(handlers, SUPPORT_CHANNELS.clearLocalData, event(7)),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
  });

  it("maps recovery and support-store failures to typed errors", async () => {
    const root = await createProject();
    const { handlers, ipcMain } = createFakeIpcMain();
    registerProjectIpc({
      ipcMain,
      saveRecovery: () => {
        return Promise.reject(
          new RecoveryStoreError(
            "too-large",
            "Recovery content was too large.",
          ),
        );
      },
      loadRecovery: () =>
        Promise.reject(
          new RecoveryStoreError("invalid", "Recovery data was invalid."),
        ),
      exportSupportLog: () => Promise.reject(new Error("Disk unavailable.")),
      selectProjectDirectory: () => Promise.resolve(root),
      trustedWebContentsId: () => 7,
    });
    const opened = (await invoke(
      handlers,
      PROJECT_CHANNELS.open,
      event(7),
    )) as { value: { projectId: string } };
    const read = (await invoke(
      handlers,
      PROJECT_CHANNELS.readTextFile,
      event(7),
      { path: "main.tex" },
    )) as { value: { version: string } };

    await expect(
      invoke(handlers, RECOVERY_CHANNELS.saveRecovery, event(7), {
        projectId: opened.value.projectId,
        buffers: [
          {
            path: "main.tex",
            content: "unsaved",
            version: read.value.version,
          },
        ],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "recovery-too-large" },
    });
    await expect(
      invoke(handlers, RECOVERY_CHANNELS.getRecovery, event(7)),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "recovery-invalid" },
    });
    await expect(
      invoke(handlers, SUPPORT_CHANNELS.exportSupportLog, event(7)),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "support-export-failed" },
    });
  });

  it("rejects untrusted senders and malformed payloads with diagnostics", async () => {
    const { handlers, ipcMain } = createFakeIpcMain();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerProjectIpc({
      ipcMain,
      selectProjectDirectory: () => Promise.resolve(null),
      trustedWebContentsId: () => 7,
    });

    await expect(
      invoke(handlers, PROJECT_CHANNELS.readTextFile, event(99), {
        path: "main.tex",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "unauthorized" },
    });
    await expect(
      invoke(handlers, PROJECT_CHANNELS.readTextFile, event(7, false), {
        path: "main.tex",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "unauthorized" },
    });
    await expect(
      invoke(handlers, PROJECT_CHANNELS.open, event(7), {
        unexpected: true,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid-request" },
    });
    await expect(
      invoke(handlers, PROJECT_CHANNELS.readTextFile, event(7), {
        path: "main.tex",
        unexpected: true,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid-request" },
    });
    expect(warning).toHaveBeenCalledTimes(4);
  });

  it("compiles through IPC, returns opaque artifact metadata, and loads bytes", async () => {
    const root = await createProject();
    const { handlers, ipcMain } = createFakeIpcMain();
    const openPath = vi.fn(() => Promise.resolve(""));
    const showItemInFolder = vi.fn();
    registerProjectIpc({
      createCompilerAdapter: () =>
        new MiktexCompilerAdapter({
          latexmkCommand: {
            executable: process.execPath,
            prefixArgs: [fakeLatexmk],
          },
          engineExecutable: process.execPath,
        }),
      ipcMain,
      openPath,
      selectProjectDirectory: () => Promise.resolve(root),
      showItemInFolder,
      trustedWebContentsId: () => 7,
    });
    await invoke(handlers, PROJECT_CHANNELS.open, event(7));

    const compileResult = await invoke(
      handlers,
      BUILD_CHANNELS.compile,
      event(7),
      { rootFile: "main.tex" },
    );
    expect(compileResult).toMatchObject({
      ok: true,
      value: {
        status: "succeeded",
        visiblePdf: {
          fileName: "main.pdf",
          isCurrent: true,
        },
      },
    });
    const visiblePdf = (
      compileResult as {
        value: { visiblePdf: { buildId: string; generation: number } };
      }
    ).value.visiblePdf;
    const artifactRequest = {
      buildId: visiblePdf.buildId,
      generation: visiblePdf.generation,
    };
    expect(JSON.stringify(compileResult)).not.toContain(root);

    await expect(
      invoke(handlers, BUILD_CHANNELS.loadPdf, event(7), artifactRequest),
    ).resolves.toMatchObject({
      ok: true,
      value: { data: expect.any(Uint8Array) },
    });
    await expect(
      invoke(handlers, BUILD_CHANNELS.openPdf, event(7), artifactRequest),
    ).resolves.toEqual({ ok: true, value: undefined });
    await expect(
      invoke(handlers, BUILD_CHANNELS.revealPdf, event(7), artifactRequest),
    ).resolves.toEqual({ ok: true, value: undefined });
    expect(openPath).toHaveBeenCalledOnce();
    expect(showItemInFolder).toHaveBeenCalledOnce();
  });

  it("maps build-session and desktop action failures to typed IPC errors", async () => {
    const root = await createProject();
    const { handlers, ipcMain } = createFakeIpcMain();
    registerProjectIpc({
      createCompilerAdapter: () =>
        new MiktexCompilerAdapter({
          latexmkCommand: {
            executable: process.execPath,
            prefixArgs: [fakeLatexmk],
          },
          engineExecutable: process.execPath,
        }),
      ipcMain,
      selectProjectDirectory: () => Promise.resolve(root),
      trustedWebContentsId: () => 7,
    });
    await invoke(handlers, PROJECT_CHANNELS.open, event(7));

    await expect(
      invoke(handlers, BUILD_CHANNELS.compile, event(7), {
        rootFile: "main.bib",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "no-root" },
    });

    const compileResult = (await invoke(
      handlers,
      BUILD_CHANNELS.compile,
      event(7),
      { rootFile: "main.tex" },
    )) as {
      value: { visiblePdf: { buildId: string; generation: number } };
    };
    const artifactRequest = {
      buildId: compileResult.value.visiblePdf.buildId,
      generation: compileResult.value.visiblePdf.generation,
    };
    await expect(
      invoke(handlers, BUILD_CHANNELS.openPdf, event(7), artifactRequest),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "external-open-failed" },
    });
    await expect(
      invoke(handlers, BUILD_CHANNELS.revealPdf, event(7), artifactRequest),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "external-open-failed" },
    });
  });

  it("reports system viewer errors and cleans up every registered handler", async () => {
    const root = await createProject();
    const { handlers, ipcMain } = createFakeIpcMain();
    const removeHandler = vi.spyOn(ipcMain, "removeHandler");
    const dispose = registerProjectIpc({
      createCompilerAdapter: () =>
        new MiktexCompilerAdapter({
          latexmkCommand: {
            executable: process.execPath,
            prefixArgs: [fakeLatexmk],
          },
          engineExecutable: process.execPath,
        }),
      ipcMain,
      openPath: () => Promise.resolve("No associated PDF application."),
      selectProjectDirectory: () => Promise.resolve(root),
      showItemInFolder: vi.fn(),
      trustedWebContentsId: () => 7,
    });
    await invoke(handlers, PROJECT_CHANNELS.open, event(7));
    const compileResult = (await invoke(
      handlers,
      BUILD_CHANNELS.compile,
      event(7),
      { rootFile: "main.tex" },
    )) as {
      value: { visiblePdf: { buildId: string; generation: number } };
    };

    await expect(
      invoke(handlers, BUILD_CHANNELS.openPdf, event(7), {
        buildId: compileResult.value.visiblePdf.buildId,
        generation: compileResult.value.visiblePdf.generation,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "external-open-failed",
        message: "No associated PDF application.",
      },
    });

    dispose();
    expect(removeHandler).toHaveBeenCalledTimes(
      Object.keys(ALL_CHANNELS).length,
    );
    expect(handlers.size).toBe(0);
  });

  it("contains unexpected handler failures", async () => {
    const { handlers, ipcMain } = createFakeIpcMain();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    registerProjectIpc({
      ipcMain,
      selectProjectDirectory: () => {
        throw new Error("Unexpected chooser failure");
      },
      trustedWebContentsId: () => 7,
    });

    await expect(
      invoke(handlers, PROJECT_CHANNELS.open, event(7)),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
    expect(error).toHaveBeenCalledOnce();
  });
});
