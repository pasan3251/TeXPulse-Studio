import { contextBridge, ipcRenderer } from "electron";

import { BUILD_CHANNELS, PROJECT_CHANNELS } from "../ipc/channels.js";
import type { TeXPulseApi } from "../ipc/api-contract.js";
import type {
  CompileProjectRequest,
  PdfArtifactRequest,
} from "../ipc/build-contracts.js";
import type {
  ProjectPathRequest,
  ProjectWriteRequest,
} from "../ipc/project-contracts.js";

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
});

contextBridge.exposeInMainWorld("texpulse", api);
