import type { ProjectFile, ProjectSymbolIndex } from "@texpulse/shared";

export interface LatexDefinitionTarget {
  kind: "file" | "label" | "citation";
  key: string;
  filePath: string;
  line: number;
  column: number;
}

const INPUT_COMMANDS = new Set(["input", "include", "subfile"]);
const REF_COMMANDS = new Set([
  "ref",
  "eqref",
  "autoref",
  "cref",
  "Cref",
  "pageref",
  "nameref",
  "vref",
]);
const CITE_COMMANDS = new Set([
  "cite",
  "citep",
  "citet",
  "autocite",
  "parencite",
  "textcite",
  "citeauthor",
  "citeyear",
  "fullcite",
  "footcite",
]);

function isPrecededByComment(docText: string, offset: number): boolean {
  const lineStart = docText.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
  const prefix = docText.slice(lineStart, offset);
  for (let i = 0; i < prefix.length; i++) {
    if (prefix[i] === "%" && (i === 0 || prefix[i - 1] !== "\\")) {
      return true;
    }
  }
  return false;
}

function normalizePosix(path: string): string {
  const cleaned = path.replace(/\\/gu, "/").trim();
  const segments: string[] = [];
  for (const part of cleaned.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      segments.pop();
    } else {
      segments.push(part);
    }
  }
  return segments.join("/");
}

function resolveProjectFileTarget(
  rawSpec: string,
  currentFilePath: string,
  files: readonly ProjectFile[],
): ProjectFile | undefined {
  const spec = rawSpec.trim();
  if (!spec) return undefined;

  const currentDir = currentFilePath.includes("/")
    ? currentFilePath.slice(0, currentFilePath.lastIndexOf("/"))
    : "";
  const candidates = new Set<string>();

  const direct = normalizePosix(spec);
  candidates.add(direct);
  if (!/\.[a-z0-9]+$/iu.test(direct)) {
    candidates.add(`${direct}.tex`);
  }
  if (currentDir) {
    const joined = normalizePosix(`${currentDir}/${spec}`);
    candidates.add(joined);
    if (!/\.[a-z0-9]+$/iu.test(joined)) {
      candidates.add(`${joined}.tex`);
    }
  }

  for (const cand of candidates) {
    const found = files.find((f) => normalizePosix(f.path) === cand);
    if (found) return found;
  }
  return undefined;
}

function pickCommaTokenAtOffset(
  innerText: string,
  braceContentStart: number,
  offset: number,
): string {
  const tokens: Array<{ value: string; from: number; to: number }> = [];
  let cursor = 0;
  for (const part of innerText.split(",")) {
    const leadingWs = /^\s*/u.exec(part)?.[0].length ?? 0;
    const trimmed = part.trim();
    const from = braceContentStart + cursor + leadingWs;
    const to = from + trimmed.length;
    if (trimmed.length > 0) {
      tokens.push({ value: trimmed, from, to });
    }
    cursor += part.length + 1;
  }

  if (tokens.length === 0) return "";
  const exact = tokens.find((t) => offset >= t.from && offset <= t.to);
  if (exact) return exact.value;
  return tokens[0]!.value;
}

/**
 * Resolves LaTeX Go-To-Definition (`F12` / `Mod-Click`) for `\input`/`\include`,
 * `\ref`/`\eqref`/`\cref`/etc., and single or multi-key `\cite{...}` commands.
 */
export function resolveLatexDefinitionAtOffset(params: {
  docText: string;
  offset: number;
  currentFilePath: string;
  files: readonly ProjectFile[];
  symbolIndex: ProjectSymbolIndex;
}): LatexDefinitionTarget | null {
  const { docText, offset, currentFilePath, files, symbolIndex } = params;
  const cmdRegex = /\\([a-zA-Z]+)(?:\[[^\]]*\])*\s*\{([^{}]*)\}/gu;

  for (const match of docText.matchAll(cmdRegex)) {
    const full = match[0];
    const cmdName = match[1] ?? "";
    const inner = match[2] ?? "";
    const matchStart = match.index ?? 0;
    const matchEnd = matchStart + full.length;

    if (offset < matchStart || offset > matchEnd) continue;
    if (isPrecededByComment(docText, matchStart)) continue;

    const braceOpenRel = full.indexOf("{");
    if (braceOpenRel === -1) continue;
    const braceContentStart = matchStart + braceOpenRel + 1;

    if (INPUT_COMMANDS.has(cmdName)) {
      const targetFile = resolveProjectFileTarget(inner, currentFilePath, files);
      if (targetFile) {
        return {
          kind: "file",
          key: inner.trim(),
          filePath: targetFile.path,
          line: 1,
          column: 1,
        };
      }
      return null;
    }

    if (REF_COMMANDS.has(cmdName)) {
      const key = pickCommaTokenAtOffset(inner, braceContentStart, offset);
      if (!key) return null;
      const hit =
        symbolIndex.labels.find((l) => l.key === key) ??
        symbolIndex.labels.find((l) => l.key.toLowerCase() === key.toLowerCase());
      if (hit) {
        return {
          kind: "label",
          key: hit.key,
          filePath: hit.filePath,
          line: hit.line,
          column: 1,
        };
      }
      return null;
    }

    if (CITE_COMMANDS.has(cmdName)) {
      const key = pickCommaTokenAtOffset(inner, braceContentStart, offset);
      if (!key) return null;
      const hit =
        symbolIndex.citations.find((c) => c.key === key) ??
        symbolIndex.citations.find((c) => c.key.toLowerCase() === key.toLowerCase());
      if (hit) {
        return {
          kind: "citation",
          key: hit.key,
          filePath: hit.filePath,
          line: hit.line,
          column: 1,
        };
      }
      return null;
    }
  }

  return null;
}
