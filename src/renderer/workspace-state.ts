import type {
  OpenProjectResult,
  ReadTextFileResult,
} from "../ipc/project-contracts.js";

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

export interface WorkspaceState {
  project: OpenedProject | null;
  buffers: Record<string, EditorBuffer>;
  activePath: string | null;
  loadingPath: string | null;
  savingPaths: string[];
  notice: string | null;
}

export type WorkspaceAction =
  | { type: "project-opened"; project: OpenedProject }
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
  | { type: "save-succeeded"; file: OpenedTextFile }
  | { type: "operation-failed"; message: string; path?: string }
  | { type: "notice-dismissed" };

export const initialWorkspaceState: WorkspaceState = {
  project: null,
  buffers: {},
  activePath: null,
  loadingPath: null,
  savingPaths: [],
  notice: null,
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
      };
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
      return {
        ...state,
        buffers: {
          ...state.buffers,
          [action.path]: { ...buffer, content: action.content },
        },
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
        notice: `Saved ${action.file.path}`,
      };
    }
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
