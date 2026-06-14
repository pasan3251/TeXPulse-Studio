import type { GitStatusSummary } from "../ipc/project-contracts.js";

export function formatGitStatus(
  status: GitStatusSummary | null,
  hasProject: boolean,
): string {
  if (status === null) {
    return hasProject ? "Git: checking" : "Git: no project";
  }
  if (status.state === "not-a-repository") {
    return "Git: not a repository";
  }
  if (status.state === "unavailable") {
    return `Git: ${status.message ?? "unavailable"}`;
  }

  const branch = status.branch ?? "detached HEAD";
  const changes =
    status.stagedCount +
    status.modifiedCount +
    status.untrackedCount +
    status.conflictedCount;
  const details: string[] = [];
  if (status.ahead > 0) {
    details.push(`ahead ${String(status.ahead)}`);
  }
  if (status.behind > 0) {
    details.push(`behind ${String(status.behind)}`);
  }
  if (changes > 0) {
    details.push(`${String(changes)} ${changes === 1 ? "change" : "changes"}`);
  }

  return details.length === 0
    ? `Git: ${branch} clean`
    : `Git: ${branch} (${details.join(", ")})`;
}
