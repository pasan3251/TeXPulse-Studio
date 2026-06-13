import { describe, expect, it } from "vitest";

import {
  initialWorkspaceState,
  isBufferModified,
  workspaceReducer,
} from "../../src/renderer/workspace-state.js";
import type { BuildView } from "../../src/ipc/build-contracts.js";

const project = {
  name: "paper",
  entries: [],
  rootCandidates: [],
  rootFile: "main.tex",
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

function successfulBuild(generation = 1): BuildView {
  return {
    buildId: `build-${String(generation)}`,
    generation,
    disposition: "current",
    status: "succeeded",
    durationMs: 100,
    failureReason: null,
    log: "complete",
    logTruncated: false,
    visiblePdf: {
      buildId: `build-${String(generation)}`,
      generation,
      fileName: "main.pdf",
      isCurrent: true,
      completedAt: "2026-06-13T12:00:00.000Z",
    },
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

  it("marks the loaded PDF as retained when source changes", () => {
    let state = workspaceReducer(initialWorkspaceState, {
      type: "file-opened",
      file: file("main.tex", "compiled"),
    });
    const build = successfulBuild();
    state = workspaceReducer(state, { type: "build-finished", build });
    state = workspaceReducer(state, {
      type: "pdf-loaded",
      artifact: build.visiblePdf!,
      data: new Uint8Array([1, 2, 3]),
    });

    state = workspaceReducer(state, {
      type: "content-changed",
      path: "main.tex",
      content: "new edit",
    });

    expect(state.build?.visiblePdf?.isCurrent).toBe(false);
    expect(state.pdf?.artifact.isCurrent).toBe(false);
  });

  it("retains the last successful PDF after a failed build", () => {
    const successful = successfulBuild();
    let state = workspaceReducer(initialWorkspaceState, {
      type: "build-finished",
      build: successful,
    });
    state = workspaceReducer(state, {
      type: "pdf-loaded",
      artifact: successful.visiblePdf!,
      data: new Uint8Array([1, 2, 3]),
    });
    state = workspaceReducer(state, {
      type: "build-finished",
      build: {
        ...successfulBuild(2),
        status: "failed",
        failureReason: "latexmk exited with code 3.",
        visiblePdf: { ...successful.visiblePdf!, isCurrent: false },
      },
    });

    expect(state.pdf).toMatchObject({
      artifact: {
        buildId: "build-1",
        generation: 1,
        isCurrent: false,
      },
    });
    expect(state.logOpen).toBe(true);
    expect(state.notice).toBe("latexmk exited with code 3.");
  });

  it("ignores an older build completion", () => {
    let state = workspaceReducer(initialWorkspaceState, {
      type: "build-finished",
      build: successfulBuild(2),
    });
    state = workspaceReducer(state, {
      type: "build-finished",
      build: successfulBuild(1),
    });

    expect(state.build?.generation).toBe(2);
  });
});
