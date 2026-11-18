import { describe, expect, it } from "vitest";

import type { GitStatusSummary } from "../../src/ipc/project-contracts.js";
import { formatGitStatus } from "../../src/renderer/git-status-label.js";

describe("formatGitStatus", () => {
  it("labels empty, non-repository, and unavailable states", () => {
    expect(formatGitStatus(null, false)).toBe("Git: no project");
    expect(formatGitStatus(null, true)).toBe("Git: checking");
    expect(
      formatGitStatus(
        gitStatus({
          state: "not-a-repository",
          message: "This project is not inside a Git repository.",
        }),
        true,
      ),
    ).toBe("Git: not a repository");
    expect(
      formatGitStatus(
        gitStatus({
          state: "unavailable",
          message: "Git could not be started.",
        }),
        true,
      ),
    ).toBe("Git: Git could not be started.");
  });

  it("labels clean and dirty repositories without exposing paths", () => {
    expect(formatGitStatus(gitStatus({ branch: "main" }), true)).toBe(
      "Git: main clean",
    );
    expect(
      formatGitStatus(
        gitStatus({
          branch: "main",
          ahead: 1,
          behind: 2,
          stagedCount: 1,
          modifiedCount: 1,
          untrackedCount: 1,
          hasChanges: true,
        }),
        true,
      ),
    ).toBe("Git: main (ahead 1, behind 2, 3 changes)");
  });
});

function gitStatus(
  overrides: Partial<GitStatusSummary> = {},
): GitStatusSummary {
  return {
    state: "repository",
    branch: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    stagedCount: 0,
    modifiedCount: 0,
    untrackedCount: 0,
    conflictedCount: 0,
    hasChanges: false,
    message: null,
    ...overrides,
  };
}
