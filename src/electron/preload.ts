import { contextBridge, ipcRenderer } from "electron";

import {
  BUILD_CHANNELS,
  PROJECT_CHANNELS,
  PROJECT_EVENTS,
  RECOVERY_CHANNELS,
  SETTINGS_CHANNELS,
  SUPPORT_CHANNELS,
  SYNCTEX_CHANNELS,
} from "../ipc/channels.js";
import type { TeXPulseApi } from "../ipc/api-contract.js";
import type {
  CompileProjectRequest,
  PdfArtifactRequest,
} from "../ipc/build-contracts.js";
import type {
  ProjectFileChange,
  ProjectPathRequest,
  ProjectWriteRequest,
} from "../ipc/project-contracts.js";
import { projectFileChangeSchema } from "../ipc/project-contracts.js";
import type {
  ForwardSyncRequest,
  InverseSyncRequest,
} from "../ipc/synctex-contracts.js";
import type { GlobalSettings } from "../settings/settings-types.js";
import type {
  ProjectSettings,
  ToolchainCheckRequest,
} from "../ipc/settings-contracts.js";
import type { SaveRecoveryRequest } from "../ipc/recovery-contracts.js";

const api: TeXPulseApi = Object.freeze({
  openProject: () => ipcRenderer.invoke(PROJECT_CHANNELS.open),
  openSampleProject: () => ipcRenderer.invoke(PROJECT_CHANNELS.openSample),
  readTextFile: (request: ProjectPathRequest) =>
    ipcRenderer.invoke(PROJECT_CHANNELS.readTextFile, request),
  writeTextFile: (request: ProjectWriteRequest) =>
    ipcRenderer.invoke(PROJECT_CHANNELS.writeTextFile, request),
  compileProject: (request: CompileProjectRequest) =>
    ipcRenderer.invoke(BUILD_CHANNELS.compile, request),
  cleanBuild: (request: CompileProjectRequest) =>
    ipcRenderer.invoke(BUILD_CHANNELS.clean, request),
  cleanupAuxiliary: () => ipcRenderer.invoke(BUILD_CHANNELS.cleanupAuxiliary),
  cancelBuild: () => ipcRenderer.invoke(BUILD_CHANNELS.cancel),
  loadPdf: (request: PdfArtifactRequest) =>
    ipcRenderer.invoke(BUILD_CHANNELS.loadPdf, request),
  openPdf: (request: PdfArtifactRequest) =>
    ipcRenderer.invoke(BUILD_CHANNELS.openPdf, request),
  revealPdf: (request: PdfArtifactRequest) =>
    ipcRenderer.invoke(BUILD_CHANNELS.revealPdf, request),
  forwardSync: (request: ForwardSyncRequest) =>
    ipcRenderer.invoke(SYNCTEX_CHANNELS.forward, request),
  inverseSync: (request: InverseSyncRequest) =>
    ipcRenderer.invoke(SYNCTEX_CHANNELS.inverse, request),
  getSettings: () => ipcRenderer.invoke(SETTINGS_CHANNELS.get),
  saveGlobalSettings: (settings: GlobalSettings) =>
    ipcRenderer.invoke(SETTINGS_CHANNELS.saveGlobal, settings),
  saveProjectSettings: (settings: ProjectSettings) =>
    ipcRenderer.invoke(SETTINGS_CHANNELS.saveProject, settings),
  checkToolchain: (request: ToolchainCheckRequest) =>
    ipcRenderer.invoke(SETTINGS_CHANNELS.toolchainCheck, request),
  saveRecovery: (request: SaveRecoveryRequest) =>
    ipcRenderer.invoke(RECOVERY_CHANNELS.saveRecovery, request),
  getRecovery: () => ipcRenderer.invoke(RECOVERY_CHANNELS.getRecovery),
  clearRecovery: () => ipcRenderer.invoke(RECOVERY_CHANNELS.clearRecovery),
  exportSupportLog: () => ipcRenderer.invoke(SUPPORT_CHANNELS.exportSupportLog),
  clearLocalData: () => ipcRenderer.invoke(SUPPORT_CHANNELS.clearLocalData),
  onProjectFileChanged: (listener: (change: ProjectFileChange) => void) => {
    const handleChange = (
      _event: Electron.IpcRendererEvent,
      value: unknown,
    ) => {
      const parsed = projectFileChangeSchema.safeParse(value);
      if (parsed.success) {
        listener(parsed.data);
      }
    };
    ipcRenderer.on(PROJECT_EVENTS.fileChanged, handleChange);
    return () => {
      ipcRenderer.removeListener(PROJECT_EVENTS.fileChanged, handleChange);
    };
  },
});

contextBridge.exposeInMainWorld("texpulse", api);
