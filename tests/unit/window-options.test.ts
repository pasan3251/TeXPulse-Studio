import { describe, expect, it } from "vitest";

import { createSecureWindowOptions } from "../../src/electron/window-options.js";

describe("secure BrowserWindow options", () => {
  it("enforces renderer isolation and disables privileged renderer features", () => {
    expect(createSecureWindowOptions("C:\\app\\preload.cjs")).toMatchObject({
      webPreferences: {
        allowRunningInsecureContent: false,
        contextIsolation: true,
        devTools: false,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
        nodeIntegrationInWorker: false,
        preload: "C:\\app\\preload.cjs",
        sandbox: true,
        webSecurity: true,
        webviewTag: false,
      },
    });
    expect(
      createSecureWindowOptions("C:\\app\\preload.cjs", true).webPreferences
        ?.devTools,
    ).toBe(true);
  });
});
