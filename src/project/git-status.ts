import {
  NodeProcessRunner,
  type ProcessResult,
  type ProcessRunner,
} from "../process/process-runner.js";

export type GitStatusState = "not-a-repository" | "repository" | "unavailable";

export interface GitStatusSummary {
  state: GitStatusState;
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  stagedCount: number;
  modifiedCount: number;
  untrackedCount: number;
  conflictedCount: number;
  hasChanges: boolean;
  message: string | null;
}

const MAX_GIT_OUTPUT_BYTES = 256 * 1024;
const GIT_STATUS_TIMEOUT_MS = 3_000;

const cleanStatus: Omit<
  GitStatusSummary,
  "branch" | "message" | "state" | "upstream"
> = {
  ahead: 0,
  behind: 0,
  conflictedCount: 0,
  hasChanges: false,
  modifiedCount: 0,
  stagedCount: 0,
  untrackedCount: 0,
};

export async function readGitStatus(
  projectRoot: string,
  options: {
    executable?: string;
    processRunner?: ProcessRunner;
  } = {},
): Promise<GitStatusSummary> {
  const processRunner = options.processRunner ?? new NodeProcessRunner();
  const result = await processRunner.run({
    executable: options.executable ?? "git",
    args: [
      "status",
      "--porcelain=v1",
      "-b",
      "--untracked-files=normal",
      "--",
      ".",
    ],
    cwd: projectRoot,
    maxOutputBytes: MAX_GIT_OUTPUT_BYTES,
    timeoutMs: GIT_STATUS_TIMEOUT_MS,
  });

  return gitStatusFromProcessResult(result);
}

export function gitStatusFromProcessResult(
  result: ProcessResult,
): GitStatusSummary {
  if (result.error !== null) {
    return unavailable("Git could not be started.");
  }
  if (result.terminationReason === "timed-out") {
    return unavailable("Git status timed out.");
  }
  if (result.outputTruncated) {
    return unavailable("Git status output exceeded the supported limit.");
  }
  if (result.exitCode !== 0) {
    const detail = `${result.stderr}\n${result.stdout}`.toLowerCase();
    if (detail.includes("not a git repository")) {
      return notRepository();
    }
    return unavailable("Git status failed.");
  }

  return parseGitStatusOutput(result.stdout);
}

export function parseGitStatusOutput(output: string): GitStatusSummary {
  const lines = output.split(/\r?\n/u).filter((line) => line.length > 0);
  const branchLine = lines[0]?.startsWith("## ") === true ? lines[0] : "##";
  const branch = parseBranchLine(branchLine);
  const counts = { ...cleanStatus };

  for (const line of lines.slice(branchLine === "##" ? 0 : 1)) {
    if (line.length < 2 || line.startsWith("## ")) {
      continue;
    }
    const x = line.charAt(0);
    const y = line.charAt(1);
    if (x === "?" && y === "?") {
      counts.untrackedCount += 1;
      continue;
    }
    if (isConflictStatus(x, y)) {
      counts.conflictedCount += 1;
      continue;
    }
    if (x !== " ") {
      counts.stagedCount += 1;
    }
    if (y !== " ") {
      counts.modifiedCount += 1;
    }
  }

  const hasChanges =
    counts.stagedCount +
      counts.modifiedCount +
      counts.untrackedCount +
      counts.conflictedCount >
    0;

  return {
    ...counts,
    ...branch,
    hasChanges,
    message: null,
    state: "repository",
  };
}

function parseBranchLine(line: string): {
  ahead: number;
  behind: number;
  branch: string | null;
  upstream: string | null;
} {
  const content = line.replace(/^## ?/u, "").trim();
  const ahead = Number(/ahead (\d+)/u.exec(content)?.[1] ?? 0);
  const behind = Number(/behind (\d+)/u.exec(content)?.[1] ?? 0);
  const withoutCounters = content.replace(/ \[[^\]]+\]$/u, "");
  const [branchPart = "", upstreamPart] = withoutCounters.split("...", 2);
  const branch =
    branchPart === "" || branchPart === "HEAD (no branch)"
      ? null
      : branchPart.replace(/^No commits yet on /u, "");

  return {
    ahead,
    behind,
    branch,
    upstream: upstreamPart ?? null,
  };
}

function isConflictStatus(x: string, y: string): boolean {
  return (
    x === "U" ||
    y === "U" ||
    (x === "A" && y === "A") ||
    (x === "D" && y === "D")
  );
}

function notRepository(): GitStatusSummary {
  return {
    ...cleanStatus,
    branch: null,
    message: "This project is not inside a Git repository.",
    state: "not-a-repository",
    upstream: null,
  };
}

function unavailable(message: string): GitStatusSummary {
  return {
    ...cleanStatus,
    branch: null,
    message,
    state: "unavailable",
    upstream: null,
  };
}
