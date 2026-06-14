import type {
  OpenProjectResult,
  ReadTextFileResult,
} from "../ipc/project-contracts.js";
import type {
  BuildDiagnostic,
  BuildView,
  PdfArtifact,
} from "../ipc/build-contracts.js";
import type { ForwardSyncTarget } from "../ipc/synctex-contracts.js";
import {
  defaultLiveBuildSettings,
  type LiveBuildPhase,
  type LiveBuildSettings,
} from "./live-build-coordinator.js";
import { DEFAULT_PANE_RATIO } from "./workspace-persistence.js";

export type OpenedProject = Extract<OpenProjectResult, { ok: true }>["value"];
export type OpenedTextFile = Extract<ReadTextFileResult, { ok: true }>["value"];

export interface EditorBuffer {
  path: string;
  content: string;
  savedContent: string;
  version: string;
  cursor: number;
  scrollTop: number;
}

export interface DiagnosticTarget {
  path: string;
  line: number;
  column: number | null;
  requestId: number;
  kind: "diagnostic" | "synctex";
}

export interface PdfSyncTarget extends ForwardSyncTarget {
  requestId: number;
}

export interface WorkspaceState {
  project: OpenedProject | null;
  buffers: Record<string, EditorBuffer>;
  activePath: string | null;
  loadingPath: string | null;
  savingPaths: string[];
  notice: string | null;
  buildPhase: LiveBuildPhase | "loading-pdf";
  build: BuildView | null;
  pdf: { artifact: PdfArtifact; data: Uint8Array } | null;
  logOpen: boolean;
  problemsOpen: boolean;
  navigationTarget: DiagnosticTarget | null;
  pdfSyncTarget: PdfSyncTarget | null;
  paneRatio: number;
  settings: LiveBuildSettings;
}

export type WorkspaceAction =
  | {
      type: "project-opened";
      project: OpenedProject;
      paneRatio?: number;
      settings?: LiveBuildSettings;
    }
  | {
      type: "files-restored";
      files: OpenedTextFile[];
      activePath: string | null;
      views: Record<string, { cursor: number; scrollTop: number }>;
    }
  | {
      type: "recovery-restored";
      files: OpenedTextFile[];
      contents: Record<string, string>;
    }
  | { type: "file-loading"; path: string }
  | { type: "file-opened"; file: OpenedTextFile }
  | { type: "file-selected"; path: string }
  | { type: "content-changed"; path: string; content: string }
  | {
      type: "view-state-changed";
      path: string;
      cursor: number;
      scrollTop: number;
    }
  | { type: "save-started"; paths: string[] }
  | { type: "save-succeeded"; file: OpenedTextFile; announce?: boolean }
  | { type: "build-phase-changed"; phase: LiveBuildPhase }
  | { type: "build-finished"; build: BuildView }
  | { type: "pdf-loading" }
  | { type: "pdf-loaded"; artifact: PdfArtifact; data: Uint8Array }
  | { type: "build-operation-failed"; message: string }
  | { type: "log-toggled" }
  | { type: "problems-toggled" }
  | {
      type: "diagnostic-selected";
      diagnostic: BuildDiagnostic;
      requestId: number;
    }
  | {
      type: "sync-forward-selected";
      target: ForwardSyncTarget;
      requestId: number;
    }
  | {
      type: "sync-inverse-selected";
      path: string;
      line: number;
      column: number | null;
      requestId: number;
    }
  | { type: "pane-ratio-changed"; paneRatio: number }
  | { type: "settings-changed"; settings: LiveBuildSettings }
  | {
      type: "project-settings-changed";
      settings: OpenedProject["settings"];
    }
  | { type: "external-change-detected"; message: string }
  | { type: "operation-failed"; message: string; path?: string }
  | { type: "notice-dismissed" };

export const initialWorkspaceState: WorkspaceState = {
  project: null,
  buffers: {},
  activePath: null,
  loadingPath: null,
  savingPaths: [],
  notice: null,
  buildPhase: "idle",
  build: null,
  pdf: null,
  logOpen: false,
  problemsOpen: false,
  navigationTarget: null,
  pdfSyncTarget: null,
  paneRatio: DEFAULT_PANE_RATIO,
  settings: defaultLiveBuildSettings(),
};

export function workspaceReducer(
  state: WorkspaceState,
  action: WorkspaceAction,
): WorkspaceState {
  switch (action.type) {
    case "project-opened":
      return {
        ...initialWorkspaceState,
        project: action.project,
        paneRatio: action.paneRatio ?? DEFAULT_PANE_RATIO,
        settings:
          action.settings ?? defaultLiveBuildSettings(action.project.autoBuild),
      };
    case "files-restored": {
      const buffers = { ...state.buffers };
      for (const file of action.files) {
        const view = action.views[file.path];
        buffers[file.path] = {
          path: file.path,
          content: file.content,
          savedContent: file.content,
          version: file.version,
          cursor: view?.cursor ?? 0,
          scrollTop: view?.scrollTop ?? 0,
        };
      }
      return {
        ...state,
        buffers,
        activePath:
          action.activePath !== null && buffers[action.activePath] !== undefined
            ? action.activePath
            : (action.files[0]?.path ?? null),
        loadingPath: null,
      };
    }
    case "recovery-restored": {
      const buffers = { ...state.buffers };
      for (const file of action.files) {
        const previous = buffers[file.path];
        const recovered = action.contents[file.path];
        if (recovered === undefined) {
          continue;
        }
        buffers[file.path] = {
          path: file.path,
          content: recovered,
          savedContent: file.content,
          version: file.version,
          cursor: previous?.cursor ?? 0,
          scrollTop: previous?.scrollTop ?? 0,
        };
      }
      return {
        ...state,
        buffers,
        activePath: action.files[0]?.path ?? state.activePath,
        build: null,
        pdf: null,
        navigationTarget: null,
        pdfSyncTarget: null,
        problemsOpen: false,
        notice: "Recovered content is open in the editor and remains unsaved.",
      };
    }
    case "file-loading":
      return {
        ...state,
        loadingPath: action.path,
        notice: null,
      };
    case "file-opened": {
      const previous = state.buffers[action.file.path];
      const isCurrentRequest = state.loadingPath === action.file.path;
      return {
        ...state,
        buffers: {
          ...state.buffers,
          [action.file.path]: {
            path: action.file.path,
            content: action.file.content,
            savedContent: action.file.content,
            version: action.file.version,
            cursor: previous?.cursor ?? 0,
            scrollTop: previous?.scrollTop ?? 0,
          },
        },
        activePath: isCurrentRequest ? action.file.path : state.activePath,
        loadingPath: isCurrentRequest ? null : state.loadingPath,
        notice: null,
      };
    }
    case "file-selected":
      return {
        ...state,
        activePath: action.path,
        loadingPath: null,
        notice: null,
      };
    case "content-changed": {
      const buffer = state.buffers[action.path];
      if (buffer === undefined) {
        return state;
      }
      const pdf =
        state.pdf === null
          ? null
          : {
              ...state.pdf,
              artifact: { ...state.pdf.artifact, isCurrent: false },
            };
      const build =
        state.build === null
          ? null
          : {
              ...state.build,
              diagnostics: [],
              visiblePdf:
                state.build.visiblePdf === null
                  ? null
                  : { ...state.build.visiblePdf, isCurrent: false },
            };
      return {
        ...state,
        build,
        buffers: {
          ...state.buffers,
          [action.path]: { ...buffer, content: action.content },
        },
        problemsOpen: false,
        navigationTarget: null,
        pdfSyncTarget: null,
        pdf,
      };
    }
    case "view-state-changed": {
      const buffer = state.buffers[action.path];
      if (buffer === undefined) {
        return state;
      }
      return {
        ...state,
        buffers: {
          ...state.buffers,
          [action.path]: {
            ...buffer,
            cursor: action.cursor,
            scrollTop: action.scrollTop,
          },
        },
      };
    }
    case "save-started":
      return {
        ...state,
        savingPaths: [...new Set([...state.savingPaths, ...action.paths])],
        notice: null,
      };
    case "save-succeeded": {
      const buffer = state.buffers[action.file.path];
      if (buffer === undefined) {
        return state;
      }
      return {
        ...state,
        buffers: {
          ...state.buffers,
          [action.file.path]: {
            ...buffer,
            savedContent: action.file.content,
            version: action.file.version,
          },
        },
        savingPaths: state.savingPaths.filter(
          (path) => path !== action.file.path,
        ),
        notice:
          action.announce === false
            ? state.notice
            : `Saved ${action.file.path}`,
      };
    }
    case "build-phase-changed":
      return {
        ...state,
        buildPhase: action.phase,
        notice: action.phase === "saving" ? null : state.notice,
      };
    case "build-finished": {
      if (
        state.build !== null &&
        action.build.generation < state.build.generation
      ) {
        return state;
      }
      const retainedPdf =
        state.pdf !== null &&
        action.build.visiblePdf !== null &&
        state.pdf.artifact.buildId === action.build.visiblePdf.buildId &&
        state.pdf.artifact.generation === action.build.visiblePdf.generation
          ? {
              ...state.pdf,
              artifact: action.build.visiblePdf,
            }
          : state.pdf;
      const hasDiagnostics = action.build.diagnostics.length > 0;
      return {
        ...state,
        buildPhase: "idle",
        build: action.build,
        pdf: retainedPdf,
        logOpen: hasDiagnostics
          ? false
          : action.build.status !== "succeeded" || state.logOpen,
        problemsOpen: hasDiagnostics,
        navigationTarget: null,
        pdfSyncTarget: null,
        notice:
          action.build.status === "succeeded"
            ? "Build succeeded."
            : (action.build.failureReason ?? `Build ${action.build.status}.`),
      };
    }
    case "pdf-loading":
      return { ...state, buildPhase: "loading-pdf" };
    case "pdf-loaded":
      if (
        state.build?.visiblePdf === null ||
        state.build?.visiblePdf === undefined ||
        state.build.visiblePdf.buildId !== action.artifact.buildId ||
        state.build.visiblePdf.generation !== action.artifact.generation
      ) {
        return state;
      }
      return {
        ...state,
        buildPhase: "idle",
        pdf: { artifact: action.artifact, data: action.data },
      };
    case "build-operation-failed":
      return {
        ...state,
        buildPhase: "idle",
        notice: action.message,
      };
    case "log-toggled":
      return {
        ...state,
        logOpen: !state.logOpen,
        problemsOpen: false,
      };
    case "problems-toggled":
      return {
        ...state,
        logOpen: false,
        problemsOpen: !state.problemsOpen,
      };
    case "diagnostic-selected": {
      const diagnostic = action.diagnostic;
      if (
        diagnostic.file === null ||
        diagnostic.line === null ||
        state.buffers[diagnostic.file] === undefined
      ) {
        return state;
      }
      return {
        ...state,
        activePath: diagnostic.file,
        navigationTarget: {
          path: diagnostic.file,
          line: diagnostic.line,
          column: diagnostic.column,
          requestId: action.requestId,
          kind: "diagnostic",
        },
        pdfSyncTarget: null,
      };
    }
    case "sync-forward-selected":
      return {
        ...state,
        pdfSyncTarget: { ...action.target, requestId: action.requestId },
        notice: `Forward search moved to PDF page ${String(action.target.page)}.`,
      };
    case "sync-inverse-selected":
      if (state.buffers[action.path] === undefined) {
        return state;
      }
      return {
        ...state,
        activePath: action.path,
        navigationTarget: {
          path: action.path,
          line: action.line,
          column: action.column,
          requestId: action.requestId,
          kind: "synctex",
        },
        pdfSyncTarget: null,
        notice: `Inverse search moved to ${action.path}:${String(action.line)}.`,
      };
    case "pane-ratio-changed":
      return { ...state, paneRatio: action.paneRatio };
    case "settings-changed":
      return { ...state, settings: action.settings };
    case "project-settings-changed":
      if (state.project === null) {
        return state;
      }
      return {
        ...state,
        project: {
          ...state.project,
          rootFile: action.settings.rootFile,
          autoBuild: action.settings.autoBuild,
          settings: action.settings,
          settingsIssues: [],
        },
        settings: {
          ...state.settings,
          autoBuild: action.settings.autoBuild,
        },
      };
    case "external-change-detected":
      return { ...state, notice: action.message };
    case "operation-failed":
      return {
        ...state,
        loadingPath:
          action.path === state.loadingPath ? null : state.loadingPath,
        savingPaths:
          action.path === undefined
            ? state.savingPaths
            : state.savingPaths.filter((path) => path !== action.path),
        notice: action.message,
      };
    case "notice-dismissed":
      return { ...state, notice: null };
  }
}

export function isBufferModified(buffer: EditorBuffer): boolean {
  return buffer.content !== buffer.savedContent;
}
