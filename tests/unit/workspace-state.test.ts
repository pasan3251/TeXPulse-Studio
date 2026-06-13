import { describe, expect, it } from "vitest";

import {
  initialWorkspaceState,
  isBufferModified,
  workspaceReducer,
} from "../../src/renderer/workspace-state.js";
import type { BuildView } from "../../src/ipc/build-contracts.js";

const project = {
  name: "paper",
  projectId: "a".repeat(16),
  entries: [],
  rootCandidates: [],
  rootFile: "main.tex",
  autoBuild: true,
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
    diagnostics: [],
    visiblePdf: {
      buildId: `build-${String(generation)}`,
      generation,
      fileName: "main.pdf",
      isCurrent: true,
      completedAt: "2026-06-13T12:00:00.000Z",
    },
  };
}

const undefinedControlSequence = {
  severity: "error" as const,
  message: "Undefined control sequence.",
  file: "main.tex",
  line: 4,
  column: 1,
  source: "latex" as const,
  rawExcerpt: "! Undefined control sequence.\nl.4 \\undefinedcommand",
};

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

  it("opens current problems, rejects stale diagnostics, and clears markers on edit", () => {
    let state = workspaceReducer(initialWorkspaceState, {
      type: "file-opened",
      file: file("main.tex", "compiled"),
    });
    state = workspaceReducer(state, {
      type: "build-finished",
      build: {
        ...successfulBuild(2),
        status: "failed",
        failureReason: "latexmk exited with code 3.",
        diagnostics: [undefinedControlSequence],
        visiblePdf: null,
      },
    });
    expect(state).toMatchObject({
      problemsOpen: true,
      logOpen: false,
      build: { generation: 2, diagnostics: [undefinedControlSequence] },
    });

    const stale = workspaceReducer(state, {
      type: "build-finished",
      build: {
        ...successfulBuild(1),
        diagnostics: [
          { ...undefinedControlSequence, message: "Stale diagnostic." },
        ],
      },
    });
    expect(stale).toBe(state);

    state = workspaceReducer(state, {
      type: "content-changed",
      path: "main.tex",
      content: "fixed",
    });
    expect(state.build?.diagnostics).toEqual([]);
    expect(state.problemsOpen).toBe(false);
  });

  it("selects only diagnostics with an available file and line", () => {
    let state = workspaceReducer(initialWorkspaceState, {
      type: "file-opened",
      file: file("main.tex", "one\ntwo\nthree\nfour"),
    });
    state = workspaceReducer(state, {
      type: "diagnostic-selected",
      diagnostic: undefinedControlSequence,
      requestId: 7,
    });
    expect(state).toMatchObject({
      activePath: "main.tex",
      diagnosticTarget: {
        path: "main.tex",
        line: 4,
        column: 1,
        requestId: 7,
      },
    });

    const unchanged = workspaceReducer(state, {
      type: "diagnostic-selected",
      diagnostic: { ...undefinedControlSequence, file: null, line: null },
      requestId: 8,
    });
    expect(unchanged).toBe(state);
  });

  it("restores open files, views, settings, and pane geometry", () => {
    const settings = {
      autosave: false,
      autoBuild: false,
      debounceMs: 1200,
    };
    let state = workspaceReducer(initialWorkspaceState, {
      type: "project-opened",
      project,
      paneRatio: 0.64,
      settings,
    });
    state = workspaceReducer(state, {
      type: "files-restored",
      files: [file("main.tex", "main"), file("intro.tex", "intro")],
      activePath: "intro.tex",
      views: {
        "main.tex": { cursor: 4, scrollTop: 90 },
      },
    });

    expect(state).toMatchObject({
      activePath: "intro.tex",
      paneRatio: 0.64,
      settings,
      buffers: {
        "main.tex": { cursor: 4, scrollTop: 90 },
        "intro.tex": { cursor: 0, scrollTop: 0 },
      },
    });

    const fallback = workspaceReducer(initialWorkspaceState, {
      type: "files-restored",
      files: [file("main.tex", "main")],
      activePath: "missing.tex",
      views: {},
    });
    expect(fallback.activePath).toBe("main.tex");
  });

  it("handles silent saves, phase notices, and workspace controls", () => {
    let state = workspaceReducer(initialWorkspaceState, {
      type: "file-opened",
      file: file("main.tex", "one"),
    });
    const unchanged = workspaceReducer(state, {
      type: "content-changed",
      path: "missing.tex",
      content: "ignored",
    });
    expect(unchanged).toBe(state);
    expect(
      workspaceReducer(state, {
        type: "view-state-changed",
        path: "missing.tex",
        cursor: 1,
        scrollTop: 1,
      }),
    ).toBe(state);
    expect(
      workspaceReducer(state, {
        type: "save-succeeded",
        file: file("missing.tex", "ignored"),
      }),
    ).toBe(state);

    state = workspaceReducer(state, {
      type: "external-change-detected",
      message: "keep this notice",
    });
    state = workspaceReducer(state, {
      type: "save-succeeded",
      file: file("main.tex", "one", "b".repeat(64)),
      announce: false,
    });
    expect(state.notice).toBe("keep this notice");

    state = workspaceReducer(state, {
      type: "build-phase-changed",
      phase: "queued",
    });
    expect(state.notice).toBe("keep this notice");
    state = workspaceReducer(state, {
      type: "build-phase-changed",
      phase: "saving",
    });
    expect(state.notice).toBeNull();

    state = workspaceReducer(state, {
      type: "pane-ratio-changed",
      paneRatio: 0.7,
    });
    state = workspaceReducer(state, {
      type: "settings-changed",
      settings: { autosave: false, autoBuild: true, debounceMs: 400 },
    });
    state = workspaceReducer(state, { type: "log-toggled" });
    expect(state).toMatchObject({
      paneRatio: 0.7,
      settings: { autosave: false, autoBuild: true, debounceMs: 400 },
      logOpen: true,
    });
  });

  it("rejects stale PDF loads and contains operation failures", () => {
    const build = successfulBuild();
    let state = workspaceReducer(initialWorkspaceState, {
      type: "build-finished",
      build,
    });
    const staleLoad = workspaceReducer(state, {
      type: "pdf-loaded",
      artifact: { ...build.visiblePdf!, generation: 2 },
      data: new Uint8Array([9]),
    });
    expect(staleLoad).toBe(state);

    state = workspaceReducer(
      { ...state, loadingPath: "main.tex", savingPaths: ["main.tex"] },
      {
        type: "operation-failed",
        message: "failed",
        path: "main.tex",
      },
    );
    expect(state).toMatchObject({
      loadingPath: null,
      savingPaths: [],
      notice: "failed",
    });
    state = workspaceReducer(state, {
      type: "operation-failed",
      message: "global",
    });
    expect(state.notice).toBe("global");
    state = workspaceReducer(state, { type: "notice-dismissed" });
    expect(state.notice).toBeNull();
    state = workspaceReducer(state, {
      type: "build-operation-failed",
      message: "build failed",
    });
    expect(state).toMatchObject({
      buildPhase: "idle",
      notice: "build failed",
    });
  });

  it("uses the build status when a failure has no reason", () => {
    const state = workspaceReducer(initialWorkspaceState, {
      type: "build-finished",
      build: {
        ...successfulBuild(),
        status: "cancelled",
        failureReason: null,
        visiblePdf: null,
      },
    });

    expect(state.notice).toBe("Build cancelled.");
    expect(state.logOpen).toBe(true);
  });
});
