export function computeSelectionMetrics(selectedText: string): {
  words: number;
  chars: number;
} {
  if (!selectedText) {
    return { words: 0, chars: 0 };
  }
  const stripped = selectedText
    .replace(/\$[^$\n]+\$/gu, " ")
    .replace(/\\[A-Za-z@]+\*?/gu, " ")
    .replace(/[{}$&~^_\\]/gu, " ");
  const tokens = stripped.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/gu);
  return {
    words: tokens?.length ?? 0,
    chars: selectedText.length,
  };
}

/**
 * Extracts package names loaded in the preamble via `\usepackage{...}`.
 */
export function extractLoadedPackages(texContent: string): string[] {
  const beginDocIdx = texContent.indexOf("\\begin{document}");
  const preamble = beginDocIdx === -1 ? texContent : texContent.slice(0, beginDocIdx);
  const uncommented = preamble.replace(/(^|[^\\])%.*$/gmu, "$1");
  const pkgs = new Set<string>();
  for (const match of uncommented.matchAll(/\\usepackage(?:\[[^\]]*\])?\{([^}]*)\}/gu)) {
    for (const raw of (match[1] ?? "").split(",")) {
      const trimmed = raw.trim();
      if (trimmed) pkgs.add(trimmed);
    }
  }
  return [...pkgs];
}

/**
 * Builds an anchored ~15-line source snippet around `lineNumber` with a `>`
 * marker on the target line so `IAssistantService` stays strictly bounded.
 */
export function buildSurroundingSnippet(
  docText: string,
  lineNumber: number,
  radius = 7,
): string {
  const lines = docText.split(/\r?\n/u);
  const clamped = Math.max(1, Math.min(lineNumber, lines.length));
  const start = Math.max(1, clamped - radius);
  const end = Math.min(lines.length, clamped + radius);
  const out: string[] = [];
  for (let ln = start; ln <= end; ln += 1) {
    const text = lines[ln - 1] ?? "";
    out.push(`${ln === clamped ? "> " : ""}${String(ln)}: ${text}`);
  }
  return out.join("\n");
}

/**
 * Applies a proposed line-range replacement cleanly to a document string.
 */
export function applyLineReplacement(
  docText: string,
  startLine: number,
  endLine: number,
  replacementSnippet: string,
): string {
  const lines = docText.split(/\r?\n/u);
  const startIdx = Math.max(0, Math.min(startLine - 1, lines.length - 1));
  const endIdx = Math.max(startIdx, Math.min(endLine - 1, lines.length - 1));
  const replacementLines = replacementSnippet.split(/\r?\n/u);
  const updated = [
    ...lines.slice(0, startIdx),
    ...replacementLines,
    ...lines.slice(endIdx + 1),
  ];
  return updated.join("\n");
}
