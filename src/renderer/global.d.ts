import type { TeXPulseApi } from "../ipc/project-contracts.js";

declare global {
  interface Window {
    texpulse: TeXPulseApi;
  }
}

export {};
