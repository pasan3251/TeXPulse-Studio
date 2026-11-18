import type { BrowserWindowConstructorOptions } from "electron/main";

export function createSecureWindowOptions(
  preloadPath: string,
  enableDevTools = false,
): BrowserWindowConstructorOptions {
  return {
    width: 1280,
    height: 800,
    minWidth: 880,
    minHeight: 560,
    show: false,
    title: "TeXPulse Studio",
    backgroundColor: "#111827",
    autoHideMenuBar: true,
    webPreferences: {
      allowRunningInsecureContent: false,
      contextIsolation: true,
      devTools: enableDevTools,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      navigateOnDragDrop: false,
      preload: preloadPath,
      sandbox: true,
      spellcheck: false,
      webSecurity: true,
      webviewTag: false,
    },
  };
}
