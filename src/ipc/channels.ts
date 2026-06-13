export const PROJECT_CHANNELS = {
  open: "project:open",
  readTextFile: "project:read-text-file",
  writeTextFile: "project:write-text-file",
} as const;

export const BUILD_CHANNELS = {
  cancel: "build:cancel",
  compile: "build:compile",
  loadPdf: "build:load-pdf",
  openPdf: "build:open-pdf",
  revealPdf: "build:reveal-pdf",
} as const;

export const ALL_CHANNELS = {
  ...PROJECT_CHANNELS,
  ...BUILD_CHANNELS,
} as const;
