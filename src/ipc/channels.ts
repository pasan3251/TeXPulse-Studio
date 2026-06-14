export const PROJECT_CHANNELS = {
  copyEntry: "project:copy-entry",
  create: "project:create",
  createDirectory: "project:create-directory",
  createTextFile: "project:create-text-file",
  deleteEntry: "project:delete-entry",
  exportZip: "project:export-zip",
  getGitStatus: "project:get-git-status",
  getRecent: "project:get-recent",
  open: "project:open",
  openRecent: "project:open-recent",
  openSample: "project:open-sample",
  readTextFile: "project:read-text-file",
  revealEntry: "project:reveal-entry",
  renameEntry: "project:rename-entry",
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

export const RECOVERY_CHANNELS = {
  clearRecovery: "recovery:clear",
  getRecovery: "recovery:get",
  saveRecovery: "recovery:save",
} as const;

export const SUPPORT_CHANNELS = {
  clearLocalData: "support:clear-local-data",
  exportSupportLog: "support:export-log",
} as const;

export const ALL_CHANNELS = {
  ...PROJECT_CHANNELS,
  ...BUILD_CHANNELS,
  ...SETTINGS_CHANNELS,
  ...SYNCTEX_CHANNELS,
  ...RECOVERY_CHANNELS,
  ...SUPPORT_CHANNELS,
} as const;
