export type PdfZoomMode = "fit-page" | "fit-width";

export interface GlobalSettings {
  schemaVersion: 1;
  theme: "system";
  autosave: boolean;
  autoBuild: boolean;
  debounceMs: number;
  compileTimeoutMs: number;
  customBinDirectory: string | null;
  editorFontSize: number;
  pdfZoomMode: PdfZoomMode;
  setupCompleted: boolean;
}

export interface GlobalSettingsLoadResult {
  settings: GlobalSettings;
  issues: string[];
  source: "default" | "file";
}

export function defaultGlobalSettings(): GlobalSettings {
  return {
    schemaVersion: 1,
    theme: "system",
    autosave: true,
    autoBuild: true,
    debounceMs: 800,
    compileTimeoutMs: 120_000,
    customBinDirectory: null,
    editorFontSize: 15,
    pdfZoomMode: "fit-width",
    setupCompleted: false,
  };
}
