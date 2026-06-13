import type { TeXPulseApi } from "../ipc/api-contract.js";

declare global {
  interface Window {
    texpulse: TeXPulseApi;
  }
}

export {};
