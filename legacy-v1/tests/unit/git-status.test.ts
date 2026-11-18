import { describe, expect, it } from "vitest";

import type { ProcessResult } from "../../src/process/process-runner.js";
import {
  gitStatusFromProcessResult,
  parseGitStatusOutput,
} from "../../src/project/git-status.js";

describe("Git status parsing", () => {
  it("summarizes branch, ahead-behind, and working tree counts", () => {
    const status = parseGitStatusOutput(
      [
        "## main...origin/main [ahead 1, behind 2]",
        "M  staged.tex",
        " M modified.tex",
        "?? notes.tex",
        "UU conflict.tex",
      ].join("\n"),
    );

    expect(status).toMatchObject({
      state: "repository",
      branch: "main",
      upstream: "origin/main",
      ahead: 1,
      behind: 2,
      stagedCount: 1,
      modifiedCount: 1,
      untrackedCount: 1,
      conflictedCount: 1,
      hasChanges: true,
      message: null,
    });
  });

  it("handles clean initial branches and detached heads", () => {
    expect(parseGitStatusOutput("## No commits yet on main\n")).toMatchObject({
      state: "repository",
      branch: "main",
      hasChanges: false,
    });
    expect(parseGitStatusOutput("## HEAD (no branch)\n")).toMatchObject({
      state: "repository",
      branch: null,
      hasChanges: false,
    });
  });

  it("maps non-repositories and unavailable Git processes to safe states", () => {
    expect(
      gitStatusFromProcessResult(
        processResult({
          exitCode: 128,
          stderr:
            "fatal: not a git repository (or any of the parent directories): .git",
        }),
      ),
    ).toMatchObject({
      state: "not-a-repository",
      hasChanges: false,
    });
    expect(
      gitStatusFromProcessResult(processResult({ error: "spawn git ENOENT" })),
    ).toMatchObject({
      state: "unavailable",
      message: "Git could not be started.",
    });
  });
});

function processResult(overrides: Partial<ProcessResult> = {}): ProcessResult {
  return {
    executable: "git",
    args: [],
    cwd: null,
    exitCode: 0,
    signal: null,
    stdout: "",
    stderr: "",
    outputTruncated: false,
    startedAt: "2026-06-14T00:00:00.000Z",
    endedAt: "2026-06-14T00:00:00.001Z",
    durationMs: 1,
    error: null,
    terminationReason: null,
    terminationError: null,
    ...overrides,
  };
}
