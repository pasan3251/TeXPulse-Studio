import { contextBridge, ipcRenderer } from "electron";

import {
  BUILD_CHANNELS,
  PROJECT_CHANNELS,
  PROJECT_EVENTS,
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

const api: TeXPulseApi = Object.freeze({
  openProject: () => ipcRenderer.invoke(PROJECT_CHANNELS.open),
  readTextFile: (request: ProjectPathRequest) =>
    ipcRenderer.invoke(PROJECT_CHANNELS.readTextFile, request),
  writeTextFile: (request: ProjectWriteRequest) =>
    ipcRenderer.invoke(PROJECT_CHANNELS.writeTextFile, request),
  compileProject: (request: CompileProjectRequest) =>
    ipcRenderer.invoke(BUILD_CHANNELS.compile, request),
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
