export const PROJECT_CHANNELS = {
  open: "project:open",
  readTextFile: "project:read-text-file",
  writeTextFile: "project:write-text-file",
} as const;

export const PROJECT_EVENTS = {
  fileChanged: "project:file-changed",
} as const;

export const BUILD_CHANNELS = {
  cancel: "build:cancel",
  clean: "build:clean",
  cleanupAuxiliary: "build:cleanup-auxiliary",
  compile: "build:compile",
  loadPdf: "build:load-pdf",
  openPdf: "build:open-pdf",
  revealPdf: "build:reveal-pdf",
} as const;

export const SETTINGS_CHANNELS = {
  get: "settings:get",
  saveGlobal: "settings:save-global",
  saveProject: "settings:save-project",
  toolchainCheck: "settings:toolchain-check",
} as const;

export const SYNCTEX_CHANNELS = {
  forward: "synctex:forward",
  inverse: "synctex:inverse",
} as const;

export const ALL_CHANNELS = {
  ...PROJECT_CHANNELS,
  ...BUILD_CHANNELS,
  ...SETTINGS_CHANNELS,
  ...SYNCTEX_CHANNELS,
} as const;
