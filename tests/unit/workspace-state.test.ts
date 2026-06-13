import { describe, expect, it } from "vitest";

import {
  initialWorkspaceState,
  isBufferModified,
  workspaceReducer,
} from "../../src/renderer/workspace-state.js";

const project = {
  name: "paper",
  entries: [],
  rootCandidates: [],
};

function file(path: string, content: string, version = "a".repeat(64)) {
  return {
    path,
    content,
    version,
    size: content.length,
    modifiedAt: "2026-06-13T12:00:00.000Z",
  };
}

describe("workspaceReducer", () => {
  it("tracks modified state and preserves newer edits after a save completes", () => {
    let state = workspaceReducer(initialWorkspaceState, {
      type: "project-opened",
      project,
    });
    state = workspaceReducer(state, {
      type: "file-opened",
      file: file("main.tex", "version one"),
    });
    state = workspaceReducer(state, {
      type: "content-changed",
      path: "main.tex",
      content: "version two",
    });
    state = workspaceReducer(state, {
      type: "save-started",
      paths: ["main.tex"],
    });
    state = workspaceReducer(state, {
      type: "content-changed",
      path: "main.tex",
      content: "version three",
    });
    state = workspaceReducer(state, {
      type: "save-succeeded",
      file: file("main.tex", "version two", "b".repeat(64)),
    });

    const buffer = state.buffers["main.tex"];
    expect(buffer).toMatchObject({
      content: "version three",
      savedContent: "version two",
      version: "b".repeat(64),
    });
    expect(buffer === undefined ? false : isBufferModified(buffer)).toBe(true);
    expect(state.savingPaths).toEqual([]);
  });

  it("remains responsive to edits while a background save is pending", () => {
    let state = workspaceReducer(initialWorkspaceState, {
      type: "project-opened",
      project,
    });
    state = workspaceReducer(state, {
      type: "file-opened",
      file: file("main.tex", "one"),
    });
    state = workspaceReducer(state, {
      type: "save-started",
      paths: ["main.tex"],
    });
    state = workspaceReducer(state, {
      type: "content-changed",
      path: "main.tex",
      content: "typing continues",
    });

    expect(state.buffers["main.tex"]?.content).toBe("typing continues");
    expect(state.savingPaths).toEqual(["main.tex"]);
  });

  it("preserves cursor and scroll state across file selection", () => {
    let state = workspaceReducer(initialWorkspaceState, {
      type: "file-opened",
      file: file("main.tex", "one"),
    });
    state = workspaceReducer(state, {
      type: "view-state-changed",
      path: "main.tex",
      cursor: 3,
      scrollTop: 120,
    });
    state = workspaceReducer(state, {
      type: "file-opened",
      file: file("notes.tex", "two"),
    });
    state = workspaceReducer(state, {
      type: "file-selected",
      path: "main.tex",
    });

    expect(state.activePath).toBe("main.tex");
    expect(state.buffers["main.tex"]).toMatchObject({
      cursor: 3,
      scrollTop: 120,
    });
  });

  it("does not let a stale file read replace the newest selection", () => {
    let state = workspaceReducer(initialWorkspaceState, {
      type: "file-loading",
      path: "slow.tex",
    });
    state = workspaceReducer(state, {
      type: "file-loading",
      path: "newest.tex",
    });
    state = workspaceReducer(state, {
      type: "file-opened",
      file: file("slow.tex", "slow"),
    });

    expect(state.activePath).toBeNull();
    expect(state.loadingPath).toBe("newest.tex");
    expect(state.buffers["slow.tex"]?.content).toBe("slow");

    state = workspaceReducer(state, {
      type: "file-opened",
      file: file("newest.tex", "newest"),
    });
    expect(state.activePath).toBe("newest.tex");
    expect(state.loadingPath).toBeNull();
  });
});
