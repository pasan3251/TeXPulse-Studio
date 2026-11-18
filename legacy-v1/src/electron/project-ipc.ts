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
  RECOVERY_CHANNELS,
  SETTINGS_CHANNELS,
  SUPPORT_CHANNELS,
} from "../ipc/channels.js";
import { SYNCTEX_CHANNELS } from "../ipc/channels.js";
import {
  type ApiError,
  copyProjectEntryRequestSchema,
  createProjectEntryRequestSchema,
  createProjectRequestSchema,
  createTextFileRequestSchema,
  deleteProjectEntryRequestSchema,
  exportProjectRequestSchema,
  exportProjectResultSchema,
  getGitStatusRequestSchema,
  gitStatusResultSchema,
  getRecentProjectsRequestSchema,
  openProjectRequestSchema,
  openProjectResultSchema,
  openRecentProjectRequestSchema,
  openSampleProjectRequestSchema,
  projectEntryActionResultSchema,
  projectMutationResultSchema,
  PROJECT_CHANNELS,
  projectPathRequestSchema,
  projectWriteRequestSchema,
  recentProjectsResultSchema,
  readTextFileResultSchema,
  renameProjectEntryRequestSchema,
  writeTextFileResultSchema,
  type ExportProjectResult,
  type GitStatusResult,
  type OpenProjectResult,
  type ProjectEntryActionResult,
  type ProjectMutationResult,
  type ReadTextFileResult,
  type RecentProjectsResult,
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
import { RecoveryStoreError } from "../recovery/recovery-store.js";
import {
  clearLocalDataRequestSchema,
  clearLocalDataResultSchema,
  clearRecoveryRequestSchema,
  clearRecoveryResultSchema,
  exportSupportLogRequestSchema,
  exportSupportLogResultSchema,
  getRecoveryRequestSchema,
  getRecoveryResultSchema,
  saveRecoveryRequestSchema,
  saveRecoveryResultSchema,
  type ClearLocalDataResult,
  type ClearRecoveryResult,
  type ExportSupportLogResult,
  type GetRecoveryResult,
  type RecoverySnapshot,
  type SaveRecoveryRequest,
  type SaveRecoveryResult,
} from "../ipc/recovery-contracts.js";

export interface ProjectIpcOptions {
  createProjectDirectory?: () => Promise<string | null>;
  createCompilerAdapter?: () => CompilerAdapter;
  createSynctexService?: () => SynctexService;
  ipcMain: Pick<IpcMain, "handle" | "removeHandler">;
  openPath?: (path: string) => Promise<string>;
  notifyProjectFileChange?: (change: ProjectFileChange) => void;
  prepareSampleProject?: () => Promise<string>;
  loadRecentProjects?: () => Promise<
    Array<{
      id: string;
      name: string;
      displayPath: string;
      lastOpenedAt: string;
    }>
  >;
  recordRecentProject?: (path: string) => Promise<void>;
  resolveRecentProject?: (id: string) => Promise<string | null>;
  selectProjectDirectory: () => Promise<string | null>;
  selectProjectExportPath?: (projectName: string) => Promise<string | null>;
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
  saveRecovery?: (request: SaveRecoveryRequest) => Promise<RecoverySnapshot>;
  loadRecovery?: (projectId: string) => Promise<RecoverySnapshot | null>;
  clearRecovery?: (projectId: string) => Promise<boolean>;
  exportSupportLog?: (redactionPaths: readonly string[]) => Promise<boolean>;
  clearLocalData?: () => Promise<{ recoverySnapshots: number }>;
  logEvent?: (
    level: "error" | "info" | "warn",
    event: string,
    details?: Readonly<Record<string, boolean | number | string | null>>,
  ) => void;
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
  const openProjectDirectory = async (
    selectedDirectory: string,
  ): Promise<OpenProjectResult> => {
    await projectSession?.dispose();
    projectSession = await ProjectSession.open(
      selectedDirectory,
      options.createCompilerAdapter?.() ?? new MiktexCompilerAdapter(),
      options.notifyProjectFileChange,
      options.createSynctexService?.(),
      async () => (await loadGlobalSettings()).settings,
    );
    await options
      .recordRecentProject?.(selectedDirectory)
      .catch((error: unknown) => {
        options.logEvent?.("warn", "recent_project_record_failed", {
          error:
            error instanceof Error ? error.message : "Unknown recent error.",
        });
      });
    options.logEvent?.("info", "project_opened", {
      projectId: projectSession.describe().projectId,
    });
    return {
      ok: true,
      value: projectSession.describe(),
    };
  };

  registerHandler(
    options,
    PROJECT_CHANNELS.create,
    createProjectRequestSchema,
    openProjectResultSchema,
    async (): Promise<OpenProjectResult> => {
      if (options.createProjectDirectory === undefined) {
        return failure(
          "project-create-failed",
          "New-project creation is unavailable.",
        );
      }
      try {
        const selectedDirectory = await options.createProjectDirectory();
        if (selectedDirectory === null) {
          return failure("cancelled", "Project creation was cancelled.");
        }
        return openProjectDirectory(selectedDirectory);
      } catch (error) {
        return failure(
          "project-create-failed",
          error instanceof Error
            ? error.message
            : "The new project could not be created.",
        );
      }
    },
  );

  registerHandler(
    options,
    PROJECT_CHANNELS.getRecent,
    getRecentProjectsRequestSchema,
    recentProjectsResultSchema,
    async (): Promise<RecentProjectsResult> => ({
      ok: true,
      value: (await options.loadRecentProjects?.()) ?? [],
    }),
  );

  registerHandler(
    options,
    PROJECT_CHANNELS.getGitStatus,
    getGitStatusRequestSchema,
    gitStatusResultSchema,
    async (): Promise<GitStatusResult> => {
      if (projectSession === null) {
        return failure(
          "no-project",
          "Open a project before reading Git status.",
        );
      }
      return { ok: true, value: await projectSession.gitStatus() };
    },
  );

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
      return openProjectDirectory(selectedDirectory);
    },
  );

  registerHandler(
    options,
    PROJECT_CHANNELS.openRecent,
    openRecentProjectRequestSchema,
    openProjectResultSchema,
    async (request): Promise<OpenProjectResult> => {
      const selectedDirectory = await options.resolveRecentProject?.(
        request.id,
      );
      if (selectedDirectory === null || selectedDirectory === undefined) {
        return failure(
          "not-found",
          "The recent project is no longer available. Remove it from the recent-project list or open it again.",
        );
      }
      return openProjectDirectory(selectedDirectory);
    },
  );

  registerHandler(
    options,
    PROJECT_CHANNELS.openSample,
    openSampleProjectRequestSchema,
    openProjectResultSchema,
    async (): Promise<OpenProjectResult> => {
      if (options.prepareSampleProject === undefined) {
        return failure("internal", "The sample project is unavailable.");
      }
      const selectedDirectory = await options.prepareSampleProject();
      return openProjectDirectory(selectedDirectory);
    },
  );

  registerHandler(
    options,
    PROJECT_CHANNELS.copyEntry,
    copyProjectEntryRequestSchema,
    projectMutationResultSchema,
    async (request): Promise<ProjectMutationResult> => {
      if (projectSession === null) {
        return failure("no-project", "Open a project before copying an entry.");
      }
      return {
        ok: true,
        value: await projectSession.copyEntry(
          request.sourcePath,
          request.destinationPath,
        ),
      };
    },
  );

  registerHandler(
    options,
    PROJECT_CHANNELS.createDirectory,
    createProjectEntryRequestSchema,
    projectMutationResultSchema,
    async (request): Promise<ProjectMutationResult> => {
      if (projectSession === null) {
        return failure(
          "no-project",
          "Open a project before creating a folder.",
        );
      }
      return {
        ok: true,
        value: await projectSession.createDirectory(request.path),
      };
    },
  );

  registerHandler(
    options,
    PROJECT_CHANNELS.createTextFile,
    createTextFileRequestSchema,
    projectMutationResultSchema,
    async (request): Promise<ProjectMutationResult> => {
      if (projectSession === null) {
        return failure("no-project", "Open a project before creating a file.");
      }
      return {
        ok: true,
        value: await projectSession.createTextFile(
          request.path,
          request.content,
        ),
      };
    },
  );

  registerHandler(
    options,
    PROJECT_CHANNELS.renameEntry,
    renameProjectEntryRequestSchema,
    projectMutationResultSchema,
    async (request): Promise<ProjectMutationResult> => {
      if (projectSession === null) {
        return failure(
          "no-project",
          "Open a project before renaming or moving an entry.",
        );
      }
      return {
        ok: true,
        value: await projectSession.renameEntry(
          request.sourcePath,
          request.destinationPath,
          request.expectedVersion,
        ),
      };
    },
  );

  registerHandler(
    options,
    PROJECT_CHANNELS.deleteEntry,
    deleteProjectEntryRequestSchema,
    projectMutationResultSchema,
    async (request): Promise<ProjectMutationResult> => {
      if (projectSession === null) {
        return failure(
          "no-project",
          "Open a project before deleting an entry.",
        );
      }
      return {
        ok: true,
        value: await projectSession.deleteEntry(
          request.path,
          request.recursive,
          request.expectedVersion,
        ),
      };
    },
  );

  registerHandler(
    options,
    PROJECT_CHANNELS.exportZip,
    exportProjectRequestSchema,
    exportProjectResultSchema,
    async (): Promise<ExportProjectResult> => {
      if (projectSession === null) {
        return failure(
          "no-project",
          "Open a project before exporting a ZIP archive.",
        );
      }
      if (options.selectProjectExportPath === undefined) {
        return failure(
          "project-export-failed",
          "Project export is unavailable.",
        );
      }
      try {
        const destination = await options.selectProjectExportPath(
          projectSession.describe().name,
        );
        if (destination === null) {
          return {
            ok: true,
            value: {
              saved: false,
              files: 0,
              skippedLinks: 0,
              totalBytes: 0,
            },
          };
        }
        const summary = await projectSession.exportProject(destination);
        return { ok: true, value: { saved: true, ...summary } };
      } catch (error) {
        return failure(
          "project-export-failed",
          error instanceof Error
            ? `Project export failed: ${error.message}`
            : "Project export failed unexpectedly.",
        );
      }
    },
  );

  registerHandler(
    options,
    RECOVERY_CHANNELS.saveRecovery,
    saveRecoveryRequestSchema,
    saveRecoveryResultSchema,
    async (request): Promise<SaveRecoveryResult> => {
      if (projectSession === null) {
        return failure(
          "no-project",
          "Open a project before saving recovery data.",
        );
      }
      if (request.projectId !== projectSession.describe().projectId) {
        return failure(
          "invalid-request",
          "Recovery data did not match the open project.",
        );
      }
      const paths = new Set<string>();
      for (const buffer of request.buffers) {
        if (paths.has(buffer.path)) {
          return failure(
            "invalid-request",
            "Recovery data contained a duplicate project path.",
          );
        }
        paths.add(buffer.path);
        await projectSession.readTextFile(buffer.path);
      }
      if (options.saveRecovery === undefined) {
        return failure("internal", "Recovery storage is unavailable.");
      }
      const snapshot = await options.saveRecovery(request);
      return { ok: true, value: { savedAt: snapshot.savedAt } };
    },
  );

  registerHandler(
    options,
    RECOVERY_CHANNELS.getRecovery,
    getRecoveryRequestSchema,
    getRecoveryResultSchema,
    async (): Promise<GetRecoveryResult> => {
      if (projectSession === null) {
        return failure(
          "no-project",
          "Open a project before loading recovery data.",
        );
      }
      if (options.loadRecovery === undefined) {
        return failure("internal", "Recovery storage is unavailable.");
      }
      const projectId = projectSession.describe().projectId;
      const snapshot = await options.loadRecovery(projectId);
      if (snapshot === null) {
        return { ok: true, value: null };
      }
      const validBuffers = [];
      for (const buffer of snapshot.buffers) {
        try {
          await projectSession.readTextFile(buffer.path);
          validBuffers.push(buffer);
        } catch {
          options.logEvent?.("warn", "recovery_path_rejected", {
            projectId,
          });
        }
      }
      if (validBuffers.length === 0) {
        await options.clearRecovery?.(projectId);
        return { ok: true, value: null };
      }
      return {
        ok: true,
        value: { ...snapshot, buffers: validBuffers },
      };
    },
  );

  registerHandler(
    options,
    RECOVERY_CHANNELS.clearRecovery,
    clearRecoveryRequestSchema,
    clearRecoveryResultSchema,
    async (): Promise<ClearRecoveryResult> => {
      if (projectSession === null) {
        return failure(
          "no-project",
          "Open a project before clearing recovery data.",
        );
      }
      if (options.clearRecovery === undefined) {
        return failure("internal", "Recovery storage is unavailable.");
      }
      return {
        ok: true,
        value: {
          cleared: await options.clearRecovery(
            projectSession.describe().projectId,
          ),
        },
      };
    },
  );

  registerHandler(
    options,
    SUPPORT_CHANNELS.exportSupportLog,
    exportSupportLogRequestSchema,
    exportSupportLogResultSchema,
    async (): Promise<ExportSupportLogResult> => {
      if (options.exportSupportLog === undefined) {
        return failure(
          "support-export-failed",
          "Support-log export is unavailable.",
        );
      }
      try {
        return {
          ok: true,
          value: {
            saved: await options.exportSupportLog(
              projectSession?.supportRedactionPaths() ?? [],
            ),
          },
        };
      } catch (error) {
        options.logEvent?.("error", "support_export_failed", {
          error:
            error instanceof Error ? error.message : "Unknown export error.",
        });
        return failure(
          "support-export-failed",
          "The support log could not be exported.",
        );
      }
    },
  );

  registerHandler(
    options,
    SUPPORT_CHANNELS.clearLocalData,
    clearLocalDataRequestSchema,
    clearLocalDataResultSchema,
    async (): Promise<ClearLocalDataResult> => {
      if (options.clearLocalData === undefined) {
        return failure("internal", "Local-data cleanup is unavailable.");
      }
      return { ok: true, value: await options.clearLocalData() };
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
    PROJECT_CHANNELS.revealEntry,
    projectPathRequestSchema,
    projectEntryActionResultSchema,
    async (request): Promise<ProjectEntryActionResult> => {
      if (projectSession === null) {
        return failure(
          "no-project",
          "Open a project before revealing an entry.",
        );
      }
      const entry = await projectSession.resolveEntryPath(request.path);
      if (entry.kind === "directory") {
        if (options.openPath === undefined) {
          return failure(
            "external-open-failed",
            "The system file manager is unavailable.",
          );
        }
        const errorMessage = await options.openPath(entry.absolutePath);
        return errorMessage === ""
          ? { ok: true, value: undefined }
          : failure("external-open-failed", errorMessage);
      }
      if (options.showItemInFolder === undefined) {
        return failure(
          "external-open-failed",
          "The system file manager is unavailable.",
        );
      }
      options.showItemInFolder(entry.absolutePath);
      return { ok: true, value: undefined };
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
      const value = await projectSession.cleanBuild(request.rootFile);
      options.logEvent?.("info", "build_completed", {
        clean: true,
        durationMs: value.durationMs,
        status: value.status,
      });
      return {
        ok: true,
        value,
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
      const value = await projectSession.compile(request.rootFile);
      options.logEvent?.("info", "build_completed", {
        clean: false,
        durationMs: value.durationMs,
        status: value.status,
      });
      return {
        ok: true,
        value,
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
        options.logEvent?.("warn", "ipc_sender_rejected", { channel });
        return responseSchema.parse(
          failure("unauthorized", "IPC sender is not trusted."),
        );
      }

      const parsed = requestSchema.safeParse(payload);
      if (!parsed.success) {
        console.warn(`[security] Rejected invalid IPC payload on ${channel}.`);
        options.logEvent?.("warn", "ipc_payload_rejected", { channel });
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
        if (error instanceof RecoveryStoreError) {
          return responseSchema.parse(
            failure(
              error.reason === "too-large"
                ? "recovery-too-large"
                : "recovery-invalid",
              error.message,
            ),
          );
        }
        console.error(`IPC handler failed on ${channel}.`, error);
        options.logEvent?.("error", "ipc_handler_failed", {
          channel,
          error:
            error instanceof Error ? error.message : "Unknown handler error.",
        });
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
