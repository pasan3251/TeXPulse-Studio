import { contextBridge, ipcRenderer } from "electron";

import { PROJECT_CHANNELS } from "../ipc/channels.js";
import type {
  ProjectPathRequest,
  ProjectWriteRequest,
  TeXPulseApi,
} from "../ipc/project-contracts.js";

const api: TeXPulseApi = Object.freeze({
  openProject: () => ipcRenderer.invoke(PROJECT_CHANNELS.open),
  readTextFile: (request: ProjectPathRequest) =>
    ipcRenderer.invoke(PROJECT_CHANNELS.readTextFile, request),
  writeTextFile: (request: ProjectWriteRequest) =>
    ipcRenderer.invoke(PROJECT_CHANNELS.writeTextFile, request),
});

contextBridge.exposeInMainWorld("texpulse", api);
