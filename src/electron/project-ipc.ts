import type { IpcMain, IpcMainInvokeEvent } from "electron/main";
import type { ZodType } from "zod";

import type { CompilerAdapter } from "../compiler/compiler-adapter.js";
import { MiktexCompilerAdapter } from "../compiler/compiler-adapter.js";
import {
  cancelBuildRequestSchema,
  cancelBuildResultSchema,
  compileProjectRequestSchema,
  compileProjectResultSchema,
  cleanBuildRequestSchema,
  cleanupAuxiliaryRequestSchema,
  cleanupAuxiliaryResultSchema,
  loadPdfResultSchema,
  pdfActionResultSchema,
  pdfArtifactRequestSchema,
  type CancelBuildResult,
  type CompileProjectResult,
  type CleanupAuxiliaryResult,
  type LoadPdfResult,
  type PdfActionResult,
} from "../ipc/build-contracts.js";
import {
  ALL_CHANNELS,
  BUILD_CHANNELS,
  SETTINGS_CHANNELS,
} from "../ipc/channels.js";
import { SYNCTEX_CHANNELS } from "../ipc/channels.js";
import {
  type ApiError,
  openProjectRequestSchema,
  openProjectResultSchema,
  PROJECT_CHANNELS,
  projectPathRequestSchema,
  projectWriteRequestSchema,
  readTextFileResultSchema,
  writeTextFileResultSchema,
  type OpenProjectResult,
  type ReadTextFileResult,
  type WriteTextFileResult,
  type ProjectFileChange,
} from "../ipc/project-contracts.js";
import { ProjectError } from "../project/project-types.js";
import type { SynctexService } from "../synctex/synctex-service.js";
import {
  forwardSyncRequestSchema,
  forwardSyncResultSchema,
  inverseSyncRequestSchema,
  inverseSyncResultSchema,
  type ForwardSyncResult,
  type InverseSyncResult,
} from "../ipc/synctex-contracts.js";
import { ProjectSession, ProjectSessionError } from "./project-session.js";
import {
  getSettingsRequestSchema,
  getSettingsResultSchema,
  saveGlobalSettingsRequestSchema,
  saveGlobalSettingsResultSchema,
  saveProjectSettingsRequestSchema,
  saveProjectSettingsResultSchema,
  toolchainCheckRequestSchema,
  toolchainCheckResultSchema,
  type GetSettingsResult,
  type ProjectSettings,
  type SaveGlobalSettingsResult,
  type SaveProjectSettingsResult,
  type ToolchainCheckRequest,
  type ToolchainCheckResult,
} from "../ipc/settings-contracts.js";
import { defaultGlobalSettings } from "../settings/settings-types.js";
import type { GlobalSettings } from "../settings/settings-types.js";

export interface ProjectIpcOptions {
  createCompilerAdapter?: () => CompilerAdapter;
  createSynctexService?: () => SynctexService;
  ipcMain: Pick<IpcMain, "handle" | "removeHandler">;
  openPath?: (path: string) => Promise<string>;
  notifyProjectFileChange?: (change: ProjectFileChange) => void;
  selectProjectDirectory: () => Promise<string | null>;
  showItemInFolder?: (path: string) => void;
  trustedWebContentsId: () => number | null;
  loadGlobalSettings?: () => Promise<{
    settings: GlobalSettings;
    issues: string[];
  }>;
  saveGlobalSettings?: (settings: GlobalSettings) => Promise<GlobalSettings>;
  checkToolchain?: (
    request: ToolchainCheckRequest,
  ) => Promise<Extract<ToolchainCheckResult, { ok: true }>["value"]>;
}

interface ApiFailure {
  ok: false;
  error: {
    code: ApiError["code"];
    message: string;
    projectPath: string | null;
  };
}

export function registerProjectIpc(options: ProjectIpcOptions): () => void {
  let projectSession: ProjectSession | null = null;
  let inMemorySettings = defaultGlobalSettings();
  const loadGlobalSettings = async () =>
    options.loadGlobalSettings?.() ?? {
      settings: inMemorySettings,
      issues: [],
    };
  const saveGlobalSettings = async (settings: GlobalSettings) => {
    const saved =
      options.saveGlobalSettings === undefined
        ? settings
        : await options.saveGlobalSettings(settings);
    inMemorySettings = saved;
    return saved;
  };

  registerHandler(
    options,
    PROJECT_CHANNELS.open,
    openProjectRequestSchema,
    openProjectResultSchema,
    async (): Promise<OpenProjectResult> => {
      const selectedDirectory = await options.selectProjectDirectory();
      if (selectedDirectory === null) {
        return failure("cancelled", "Project selection was cancelled.");
      }

      await projectSession?.dispose();
      projectSession = await ProjectSession.open(
        selectedDirectory,
        options.createCompilerAdapter?.() ?? new MiktexCompilerAdapter(),
        options.notifyProjectFileChange,
        options.createSynctexService?.(),
        async () => (await loadGlobalSettings()).settings,
      );
      return {
        ok: true,
        value: projectSession.describe(),
      };
    },
  );

  registerHandler(
    options,
    SETTINGS_CHANNELS.get,
    getSettingsRequestSchema,
    getSettingsResultSchema,
    async (): Promise<GetSettingsResult> => ({
      ok: true,
      value: await loadGlobalSettings(),
    }),
  );

  registerHandler(
    options,
    SETTINGS_CHANNELS.saveGlobal,
    saveGlobalSettingsRequestSchema,
    saveGlobalSettingsResultSchema,
    async (request): Promise<SaveGlobalSettingsResult> => ({
      ok: true,
      value: await saveGlobalSettings(request),
    }),
  );

  registerHandler(
    options,
    SETTINGS_CHANNELS.saveProject,
    saveProjectSettingsRequestSchema,
    saveProjectSettingsResultSchema,
    async (request: ProjectSettings): Promise<SaveProjectSettingsResult> => {
      if (projectSession === null) {
        return failure(
          "no-project",
          "Open a project before saving project settings.",
        );
      }
      return {
        ok: true,
        value: await projectSession.updateProjectSettings(request),
      };
    },
  );

  registerHandler(
    options,
    SETTINGS_CHANNELS.toolchainCheck,
    toolchainCheckRequestSchema,
    toolchainCheckResultSchema,
    async (request): Promise<ToolchainCheckResult> => {
      if (options.checkToolchain === undefined) {
        return failure(
          "internal",
          "The toolchain self-test service is unavailable.",
        );
      }
      return { ok: true, value: await options.checkToolchain(request) };
    },
  );

  registerHandler(
    options,
    PROJECT_CHANNELS.readTextFile,
    projectPathRequestSchema,
    readTextFileResultSchema,
    async (request): Promise<ReadTextFileResult> => {
      if (projectSession === null) {
        return failure("no-project", "Open a project before reading files.");
      }
      return {
        ok: true,
        value: await projectSession.readTextFile(request.path),
      };
    },
  );

  registerHandler(
    options,
    BUILD_CHANNELS.clean,
    cleanBuildRequestSchema,
    compileProjectResultSchema,
    async (request): Promise<CompileProjectResult> => {
      if (projectSession === null) {
        return failure("no-project", "Open a project before compiling.");
      }
      return {
        ok: true,
        value: await projectSession.cleanBuild(request.rootFile),
      };
    },
  );

  registerHandler(
    options,
    BUILD_CHANNELS.cleanupAuxiliary,
    cleanupAuxiliaryRequestSchema,
    cleanupAuxiliaryResultSchema,
    async (): Promise<CleanupAuxiliaryResult> => {
      if (projectSession === null) {
        return failure(
          "no-project",
          "Open a project before cleaning auxiliary files.",
        );
      }
      return {
        ok: true,
        value: { removedFiles: await projectSession.cleanupAuxiliary() },
      };
    },
  );

  registerHandler(
    options,
    PROJECT_CHANNELS.writeTextFile,
    projectWriteRequestSchema,
    writeTextFileResultSchema,
    async (request): Promise<WriteTextFileResult> => {
      if (projectSession === null) {
        return failure("no-project", "Open a project before saving files.");
      }
      return {
        ok: true,
        value: await projectSession.writeTextFile(
          request.path,
          request.content,
          request.expectedVersion,
        ),
      };
    },
  );

  registerHandler(
    options,
    BUILD_CHANNELS.compile,
    compileProjectRequestSchema,
    compileProjectResultSchema,
    async (request): Promise<CompileProjectResult> => {
      if (projectSession === null) {
        return failure("no-project", "Open a project before compiling.");
      }
      return {
        ok: true,
        value: await projectSession.compile(request.rootFile),
      };
    },
  );

  registerHandler(
    options,
    BUILD_CHANNELS.cancel,
    cancelBuildRequestSchema,
    cancelBuildResultSchema,
    async (): Promise<CancelBuildResult> => {
      if (projectSession === null) {
        return failure("no-project", "Open a project before cancelling.");
      }
      return {
        ok: true,
        value: { cancelled: await projectSession.cancelBuild() },
      };
    },
  );

  registerHandler(
    options,
    SYNCTEX_CHANNELS.forward,
    forwardSyncRequestSchema,
    forwardSyncResultSchema,
    async (request): Promise<ForwardSyncResult> => {
      if (projectSession === null) {
        return failure(
          "no-project",
          "Open a project before using SyncTeX navigation.",
        );
      }
      return { ok: true, value: await projectSession.forwardSync(request) };
    },
  );

  registerHandler(
    options,
    SYNCTEX_CHANNELS.inverse,
    inverseSyncRequestSchema,
    inverseSyncResultSchema,
    async (request): Promise<InverseSyncResult> => {
      if (projectSession === null) {
        return failure(
          "no-project",
          "Open a project before using SyncTeX navigation.",
        );
      }
      return { ok: true, value: await projectSession.inverseSync(request) };
    },
  );

  registerHandler(
    options,
    BUILD_CHANNELS.loadPdf,
    pdfArtifactRequestSchema,
    loadPdfResultSchema,
    async (request): Promise<LoadPdfResult> => {
      if (projectSession === null) {
        return failure("no-project", "Open a project before loading a PDF.");
      }
      return { ok: true, value: await projectSession.loadPdf(request) };
    },
  );

  registerHandler(
    options,
    BUILD_CHANNELS.openPdf,
    pdfArtifactRequestSchema,
    pdfActionResultSchema,
    async (request): Promise<PdfActionResult> => {
      if (projectSession === null) {
        return failure("no-project", "Open a project before opening a PDF.");
      }
      if (options.openPath === undefined) {
        return failure(
          "external-open-failed",
          "The system PDF viewer is unavailable.",
        );
      }
      const artifact = await projectSession.resolvePdf(request);
      const errorMessage = await options.openPath(artifact.path);
      if (errorMessage === "") {
        return { ok: true, value: undefined };
      }
      return failure("external-open-failed", errorMessage);
    },
  );

  registerHandler(
    options,
    BUILD_CHANNELS.revealPdf,
    pdfArtifactRequestSchema,
    pdfActionResultSchema,
    async (request): Promise<PdfActionResult> => {
      if (projectSession === null) {
        return failure("no-project", "Open a project before revealing a PDF.");
      }
      if (options.showItemInFolder === undefined) {
        return failure(
          "external-open-failed",
          "The system file manager is unavailable.",
        );
      }
      const artifact = await projectSession.resolvePdf(request);
      options.showItemInFolder(artifact.path);
      return { ok: true, value: undefined };
    },
  );

  return () => {
    void projectSession?.dispose();
    for (const channel of Object.values(ALL_CHANNELS)) {
      options.ipcMain.removeHandler(channel);
    }
  };
}

function registerHandler<Request, Response>(
  options: ProjectIpcOptions,
  channel: string,
  requestSchema: ZodType<Request>,
  responseSchema: ZodType<Response>,
  handler: (request: Request) => Promise<Response>,
): void {
  options.ipcMain.handle(
    channel,
    async (event: IpcMainInvokeEvent, payload: unknown): Promise<Response> => {
      const trustedWebContentsId = options.trustedWebContentsId();
      if (
        trustedWebContentsId === null ||
        event.sender.id !== trustedWebContentsId ||
        event.senderFrame !== event.sender.mainFrame
      ) {
        console.warn(`[security] Rejected untrusted IPC call on ${channel}.`);
        return responseSchema.parse(
          failure("unauthorized", "IPC sender is not trusted."),
        );
      }

      const parsed = requestSchema.safeParse(payload);
      if (!parsed.success) {
        console.warn(`[security] Rejected invalid IPC payload on ${channel}.`);
        return responseSchema.parse(
          failure("invalid-request", "IPC request was invalid."),
        );
      }

      try {
        return responseSchema.parse(await handler(parsed.data));
      } catch (error) {
        if (error instanceof ProjectError) {
          return responseSchema.parse(
            failure(error.code, error.message, error.projectPath),
          );
        }
        if (error instanceof ProjectSessionError) {
          return responseSchema.parse(failure(error.code, error.message));
        }
        console.error(`IPC handler failed on ${channel}.`, error);
        return responseSchema.parse(
          failure("internal", "The requested operation failed."),
        );
      }
    },
  );
}

function failure(
  code: ApiFailure["error"]["code"],
  message: string,
  projectPath: string | null = null,
): ApiFailure {
  return { ok: false, error: { code, message, projectPath } };
}
