import type { RootCandidate } from "./project-types.js";

const ROOT_NAMES = new Set(["main.tex", "root.tex", "thesis.tex"]);

export function rankRootCandidates(
  files: ReadonlyArray<{ path: string; content: string }>,
): RootCandidate[] {
  const candidates: RootCandidate[] = [];
  for (const file of files) {
    if (!file.path.toLowerCase().endsWith(".tex")) {
      continue;
    }

    const reasons: string[] = [];
    let score = 0;
    if (/\\documentclass\s*(?:\[[^\]]*\])?\s*\{[^}]+\}/u.test(file.content)) {
      score += 100;
      reasons.push("contains documentclass");
    }
    if (/\\begin\s*\{document\}/u.test(file.content)) {
      score += 40;
      reasons.push("contains document environment");
    }
    const name = file.path.split("/").at(-1)?.toLowerCase();
    if (name !== undefined && ROOT_NAMES.has(name)) {
      score += 20;
      reasons.push("uses a conventional root filename");
    }
    if (score > 0) {
      candidates.push({ path: file.path, score, reasons });
    }
  }

  return candidates.sort(
    (left, right) =>
      right.score - left.score || left.path.localeCompare(right.path),
  );
}
