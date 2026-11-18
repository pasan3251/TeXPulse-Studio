import type { DiagnosticCategory, DiagnosticSeverity } from "@texpulse/shared";

export interface ParsedLatexLogEntry {
  level: DiagnosticSeverity;
  category: DiagnosticCategory;
  message: string;
  file: string | null;
  line: number | null;
  raw: string;
  commandToken?: string | undefined;
  environmentName?: string | undefined;
}

export interface ParsedLatexLogResult {
  errors: ParsedLatexLogEntry[];
  warnings: ParsedLatexLogEntry[];
  typesetting: ParsedLatexLogEntry[];
  all: ParsedLatexLogEntry[];
}

export interface LatexLogParseOptions {
  ignoreDuplicates?: boolean | undefined;
  rootFile?: string | undefined;
}

const FILE_LINE_ERROR_RE =
  /^((?:[A-Za-z]:)?[^\r\n:*?"<>|]*?\.(?:tex|ltx|sty|cls|def|fd|clo|dtx|bib|aux|bbl)):(\d+):\s*(.+)$/u;
const BANG_ERROR_RE = /^!\s+(.+)$/u;
const RUNAWAY_ARG_RE = /^Runaway argument\?$/u;
const EMERGENCY_STOP_RE = /^!\s*(Emergency stop\.?|==> Fatal error occurred.*)$/u;
const LINE_CONTEXT_RE = /^l\.(\d+)\s*(.*)$/u;
const LATEX_WARNING_RE = /^LaTeX Warning:\s*(.+)$/u;
const FONT_WARNING_RE = /^LaTeX Font Warning:\s*(.+)$/u;
const PACKAGE_OR_CLASS_WARNING_RE =
  /^(Package|Class)\s+([^\s]+)\s+Warning:\s*(.+)$/u;
const TYPESETTING_BOX_RE = /^(Overfull|Underfull)\s+\\([hv]box)\s+(.+)$/u;
const INPUT_LINE_RE = /\bon input line\s+(\d+)\b/iu;
const AT_LINES_RE = /\bat lines?\s+(\d+)(?:--(\d+))?\b/iu;
const ENV_UNDEFINED_RE = /LaTeX Error:\s*Environment\s+([^\s]+)\s+undefined/iu;
const NO_FILE_AUX_RE = /^No file\s+(.+)\.aux\.$/u;

const NON_SOURCE_FILE_EXTENSIONS = new Set([
  ".aux",
  ".bbl",
  ".blg",
  ".cfg",
  ".clo",
  ".def",
  ".fd",
  ".fmt",
  ".lof",
  ".lot",
  ".nav",
  ".out",
  ".pdf",
  ".snm",
  ".synctex",
  ".toc",
]);

function isLikelyFileToken(token: string): boolean {
  const cleaned = token.replace(/^"|"$/gu, "");
  if (!cleaned || cleaned.includes(")")) return false;
  if (cleaned.startsWith("./") || cleaned.startsWith(".\\") || cleaned.startsWith("/")) {
    return true;
  }
  if (/^[A-Za-z]:[\\/]/u.test(cleaned)) {
    return true;
  }
  return /\.(?:tex|ltx|sty|cls|def|fd|clo|aux|bbl|toc|out|cfg|otf|ttf)$/iu.test(
    cleaned,
  );
}

export function normalizeLogFilePath(
  rawPath: string | null | undefined,
  rootFile = "main.tex",
): string {
  if (!rawPath) return rootFile;
  let cleaned = rawPath.trim().replace(/^["`']|["`']$/gu, "");
  cleaned = cleaned.replaceAll("\\", "/");
  while (cleaned.startsWith("./")) {
    cleaned = cleaned.slice(2);
  }
  if (!cleaned) return rootFile;

  const lower = cleaned.toLowerCase();
  if (lower.startsWith(".texpulse-cache/") || lower.includes("/.texpulse-cache/")) {
    return rootFile;
  }
  if (lower.endsWith(".aux") || lower.endsWith(".bbl")) {
    return rootFile;
  }
  return cleaned;
}

function isProjectSourceFile(path: string): boolean {
  const lower = path.toLowerCase();
  if (lower.startsWith(".texpulse-cache/") || lower.includes("/.texpulse-cache/")) {
    return false;
  }
  if (lower.includes("/miktex/") || lower.includes("/texlive/") || lower.includes("/texmf")) {
    return false;
  }
  for (const ext of NON_SOURCE_FILE_EXTENSIONS) {
    if (lower.endsWith(ext)) return false;
  }
  return lower.endsWith(".tex") || lower.endsWith(".bib") || lower.endsWith(".sty") || lower.endsWith(".cls");
}

function unwrapTeXLogLines(logText: string): string[] {
  const rawLines = logText.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  const merged: string[] = [];

  for (let i = 0; i < rawLines.length; i += 1) {
    let current = rawLines[i] ?? "";
    while (current.length === 79 && i + 1 < rawLines.length) {
      const next = rawLines[i + 1] ?? "";
      if (
        next === "" ||
        FILE_LINE_ERROR_RE.test(next) ||
        BANG_ERROR_RE.test(next) ||
        LINE_CONTEXT_RE.test(next) ||
        LATEX_WARNING_RE.test(next) ||
        PACKAGE_OR_CLASS_WARNING_RE.test(next) ||
        TYPESETTING_BOX_RE.test(next)
      ) {
        break;
      }
      current += next;
      i += 1;
    }
    merged.push(current);
  }

  return merged;
}

function isDiagnosticStart(line: string): boolean {
  return (
    FILE_LINE_ERROR_RE.test(line) ||
    BANG_ERROR_RE.test(line) ||
    RUNAWAY_ARG_RE.test(line) ||
    LATEX_WARNING_RE.test(line) ||
    FONT_WARNING_RE.test(line) ||
    PACKAGE_OR_CLASS_WARNING_RE.test(line) ||
    TYPESETTING_BOX_RE.test(line)
  );
}

function extractCommandTokenFromContext(contextText: string): string | undefined {
  const trimmed = contextText.trimEnd();
  const tailMatch = /(\\[A-Za-z@]+|\\[^A-Za-z\s])\s*$/u.exec(trimmed);
  if (tailMatch?.[1]) {
    return tailMatch[1];
  }
  const anyMacro = /\\([A-Za-z@]+)/u.exec(trimmed);
  return anyMacro ? `\\${anyMacro[1]}` : undefined;
}

function updateFileStackFromLine(line: string, stack: Array<string | null>): void {
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === "(") {
      let end = i + 1;
      if (line[end] === '"') {
        end += 1;
        while (end < line.length && line[end] !== '"') end += 1;
        if (end < line.length && line[end] === '"') end += 1;
      } else {
        while (end < line.length && line[end] !== " " && line[end] !== ")" && line[end] !== "\t") {
          end += 1;
        }
      }
      const token = line.slice(i + 1, end).trim();
      if (isLikelyFileToken(token)) {
        stack.push(token);
        i = end;
        continue;
      }
      stack.push(null);
      i += 1;
      continue;
    }
    if (ch === ")") {
      if (stack.length > 0) {
        stack.pop();
      }
    }
    i += 1;
  }
}

function resolveActiveProjectFile(
  stack: ReadonlyArray<string | null>,
  rootFile: string,
): string {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const entry = stack[i];
    if (!entry) continue;
    const normalized = normalizeLogFilePath(entry, rootFile);
    if (isProjectSourceFile(normalized)) {
      return normalized;
    }
  }
  return rootFile;
}

/**
 * Deterministic state-machine parser for settled TeX `.log` files generated
 * with `-interaction=nonstopmode -file-line-error` (inspired by Overleaf's
 * `latex-log-parser`). Never operates on compiler `stdout`.
 */
export class LatexLogParser {
  static parse(
    logText: string,
    options: LatexLogParseOptions = {},
  ): ParsedLatexLogResult {
    const ignoreDuplicates = options.ignoreDuplicates ?? true;
    const rootFile = normalizeLogFilePath(options.rootFile ?? "main.tex", "main.tex");

    const errors: ParsedLatexLogEntry[] = [];
    const warnings: ParsedLatexLogEntry[] = [];
    const typesetting: ParsedLatexLogEntry[] = [];
    const all: ParsedLatexLogEntry[] = [];
    const seenKeys = new Set<string>();

    const record = (entry: ParsedLatexLogEntry): void => {
      const normalizedFile = normalizeLogFilePath(entry.file, rootFile);
      const dedupeKey = `${entry.category}|${normalizedFile}|${String(entry.line ?? 0)}|${entry.message}`;
      if (ignoreDuplicates && seenKeys.has(dedupeKey)) {
        return;
      }
      seenKeys.add(dedupeKey);

      const finalized: ParsedLatexLogEntry = {
        ...entry,
        file: normalizedFile,
      };
      all.push(finalized);
      if (finalized.category === "error") {
        errors.push(finalized);
      } else if (finalized.category === "warning") {
        warnings.push(finalized);
      } else {
        typesetting.push(finalized);
      }
    };

    if (!logText.trim()) {
      return { errors, warnings, typesetting, all };
    }

    const lines = unwrapTeXLogLines(logText);
    const fileStack: Array<string | null> = [];

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? "";

      const fileLineMatch = FILE_LINE_ERROR_RE.exec(line);
      if (fileLineMatch) {
        const rawFile = fileLineMatch[1]!;
        const lineNumber = Number.parseInt(fileLineMatch[2]!, 10);
        const message = fileLineMatch[3]!.trim();
        const collectedRaw: string[] = [line];
        let commandToken: string | undefined;

        let j = i + 1;
        let sawLineContext = false;
        while (j < lines.length && collectedRaw.length < 14) {
          const next = lines[j] ?? "";
          if (
            isDiagnosticStart(next) ||
            /^LaTeX Font Info:/u.test(next) ||
            /^\[\d+/u.test(next) ||
            /^\s*\)+/u.test(next)
          ) {
            break;
          }
          collectedRaw.push(next);
          const ctxMatch = LINE_CONTEXT_RE.exec(next);
          if (ctxMatch) {
            sawLineContext = true;
            commandToken = extractCommandTokenFromContext(ctxMatch[2] ?? "");
            if (!commandToken && j + 1 < lines.length) {
              const continuation = lines[j + 1] ?? "";
              const altCmd = /^\s*(\\[A-Za-z@]+)/u.exec(continuation);
              if (altCmd?.[1]) {
                commandToken = altCmd[1];
              }
            }
          }
          if (sawLineContext && next.trim() === "" && collectedRaw.length > 3) {
            break;
          }
          j += 1;
        }

        const envMatch = ENV_UNDEFINED_RE.exec(message);
        record({
          level: "error",
          category: "error",
          message,
          file: normalizeLogFilePath(rawFile, rootFile),
          line: Number.isFinite(lineNumber) && lineNumber > 0 ? lineNumber : 1,
          raw: collectedRaw.join("\n").trimEnd(),
          commandToken,
          environmentName: envMatch?.[1],
        });
        i = j - 1;
        continue;
      }

      const bangMatch = BANG_ERROR_RE.exec(line);
      const runawayMatch = RUNAWAY_ARG_RE.test(line);
      if (bangMatch || runawayMatch) {
        if (EMERGENCY_STOP_RE.test(line) && errors.length > 0) {
          // TeX appends `! Emergency stop.` at EOF after earlier fatal errors;
          // keep only if no prior error was captured.
          continue;
        }
        const message = (bangMatch?.[1] ?? line).trim();
        const collectedRaw: string[] = [line];
        let lineNumber: number | null = null;
        let commandToken: string | undefined;

        let j = i + 1;
        let sawLineContext = false;
        while (j < lines.length && collectedRaw.length < 14) {
          const next = lines[j] ?? "";
          if (
            isDiagnosticStart(next) ||
            /^LaTeX Font Info:/u.test(next) ||
            /^\[\d+/u.test(next) ||
            /^\s*\)+/u.test(next)
          ) {
            break;
          }
          collectedRaw.push(next);
          const ctxMatch = LINE_CONTEXT_RE.exec(next);
          if (ctxMatch) {
            sawLineContext = true;
            lineNumber = Number.parseInt(ctxMatch[1]!, 10);
            commandToken = extractCommandTokenFromContext(ctxMatch[2] ?? "");
          }
          if (sawLineContext && next.trim() === "" && collectedRaw.length > 3) {
            break;
          }
          j += 1;
        }

        const envMatch = ENV_UNDEFINED_RE.exec(message);
        record({
          level: "error",
          category: "error",
          message,
          file: resolveActiveProjectFile(fileStack, rootFile),
          line: lineNumber ?? 1,
          raw: collectedRaw.join("\n").trimEnd(),
          commandToken,
          environmentName: envMatch?.[1],
        });
        i = j - 1;
        continue;
      }

      const latexWarnMatch = LATEX_WARNING_RE.exec(line);
      const fontWarnMatch = FONT_WARNING_RE.exec(line);
      const pkgWarnMatch = PACKAGE_OR_CLASS_WARNING_RE.exec(line);
      if (latexWarnMatch || fontWarnMatch || pkgWarnMatch) {
        const collectedRaw: string[] = [line];
        const messageParts: string[] = [
          pkgWarnMatch
            ? `${pkgWarnMatch[1]} ${pkgWarnMatch[2]} Warning: ${pkgWarnMatch[3]}`
            : latexWarnMatch
              ? latexWarnMatch[1]!
              : fontWarnMatch![1]!,
        ];

        const contPrefix = pkgWarnMatch ? `(${pkgWarnMatch[2]})` : "";
        let j = i + 1;
        while (j < lines.length && collectedRaw.length < 8) {
          const next = lines[j] ?? "";
          if (
            next.trim() === "" ||
            isDiagnosticStart(next) ||
            !/^(?:\s{2,}|\([^)]+\)\s)/u.test(next)
          ) {
            break;
          }
          collectedRaw.push(next);
          const trimmedNext = contPrefix && next.startsWith(contPrefix)
            ? next.slice(contPrefix.length).trim()
            : next.trim();
          if (trimmedNext) {
            messageParts.push(trimmedNext);
          }
          j += 1;
        }

        const fullMsg = messageParts.join(" ").replace(/\s+/gu, " ").trim();
        const lineMatch = INPUT_LINE_RE.exec(fullMsg);
        const lineNo = lineMatch?.[1] ? Number.parseInt(lineMatch[1], 10) : 1;

        record({
          level: "warning",
          category: "warning",
          message: fullMsg,
          file: resolveActiveProjectFile(fileStack, rootFile),
          line: Number.isFinite(lineNo) && lineNo > 0 ? lineNo : 1,
          raw: collectedRaw.join("\n").trimEnd(),
        });
        i = j - 1;
        continue;
      }

      const boxMatch = TYPESETTING_BOX_RE.exec(line);
      if (boxMatch) {
        const collectedRaw: string[] = [line];
        const next = lines[i + 1] ?? "";
        if (next.trim() !== "" && !isDiagnosticStart(next) && !next.startsWith("(") && !next.startsWith("[")) {
          collectedRaw.push(next);
          i += 1;
        }
        const linesMatch = AT_LINES_RE.exec(line);
        const lineNo = linesMatch?.[1] ? Number.parseInt(linesMatch[1], 10) : 1;

        record({
          level: "info",
          category: "typesetting",
          message: line.trim(),
          file: resolveActiveProjectFile(fileStack, rootFile),
          line: Number.isFinite(lineNo) && lineNo > 0 ? lineNo : 1,
          raw: collectedRaw.join("\n").trimEnd(),
        });
        continue;
      }

      if (NO_FILE_AUX_RE.test(line)) {
        updateFileStackFromLine(line, fileStack);
        continue;
      }

      updateFileStackFromLine(line, fileStack);
    }

    return { errors, warnings, typesetting, all };
  }
}
