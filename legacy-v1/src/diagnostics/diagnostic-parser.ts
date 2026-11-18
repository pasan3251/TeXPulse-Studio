import type { CompileStatus } from "../compiler/compile-types.js";
import type {
  BuildDiagnostic,
  DiagnosticSeverity,
  DiagnosticSource,
} from "./diagnostic-types.js";

const MAX_DIAGNOSTICS = 200;
const MAX_MESSAGE_CHARACTERS = 4_096;
const MAX_EXCERPT_CHARACTERS = 2_048;
const PROJECT_FILE_PATTERN = /\.(?:bib|cls|sty|tex)$/iu;

export interface ParseBuildDiagnosticsInput {
  log: string;
  status: CompileStatus | "superseded";
  failureReason: string | null;
  rootFile: string;
  projectFiles: readonly string[];
}

interface DiagnosticCandidate {
  severity: DiagnosticSeverity;
  message: string;
  file?: string | null;
  line?: number | null;
  column?: number | null;
  source: DiagnosticSource;
  rawExcerpt: string;
}

export function parseBuildDiagnostics(
  input: ParseBuildDiagnosticsInput,
): BuildDiagnostic[] {
  try {
    return parseDiagnostics(input);
  } catch {
    return fallbackDiagnostics(input);
  }
}

function parseDiagnostics(
  input: ParseBuildDiagnosticsInput,
): BuildDiagnostic[] {
  const lines = input.log.replaceAll("\r\n", "\n").split("\n");
  const knownFiles = normalizeKnownFiles(input.projectFiles);
  const rootFile = resolveKnownFile(input.rootFile, knownFiles);
  const diagnostics: BuildDiagnostic[] = [];
  const seen = new Set<string>();
  let currentFile = rootFile;

  const add = (candidate: DiagnosticCandidate): void => {
    if (diagnostics.length >= MAX_DIAGNOSTICS) {
      return;
    }
    const diagnostic = normalizeDiagnostic(candidate, knownFiles, currentFile);
    const key = [
      diagnostic.severity,
      diagnostic.message,
      diagnostic.file ?? "",
      diagnostic.line ?? "",
      diagnostic.column ?? "",
      diagnostic.source,
    ].join("\0");
    if (!seen.has(key)) {
      seen.add(key);
      diagnostics.push(diagnostic);
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    const openedFiles = filesOpenedByLine(line, knownFiles);
    if (openedFiles.length > 0) {
      currentFile = openedFiles.at(-1) ?? currentFile;
    }
    if (trimmed === "") {
      continue;
    }

    const generic = matchFileDiagnostic(lines, index, knownFiles);
    if (generic !== null) {
      add(generic);
      continue;
    }

    if (/^!\s*Undefined control sequence\./iu.test(trimmed)) {
      const location = followingLatexLocation(lines, index);
      add({
        severity: "error",
        message: "Undefined control sequence.",
        line: location.line,
        column: location.column,
        source: "latex",
        rawExcerpt: excerpt(lines, index, location.index),
      });
      continue;
    }

    const latexError = /^!\s*LaTeX Error:\s*(.+)$/iu.exec(trimmed);
    if (latexError !== null) {
      const location = followingLatexLocation(lines, index);
      add({
        severity: "error",
        message: explainLatexError(latexError[1] ?? "LaTeX error."),
        line: location.line,
        column: location.column,
        source: "latex",
        rawExcerpt: excerpt(lines, index, location.index),
      });
      continue;
    }

    if (/^!\s*Emergency stop\./iu.test(trimmed)) {
      const location = followingLatexLocation(lines, index);
      add({
        severity: "error",
        message:
          "LaTeX stopped before completing the document. Check the preceding error and source syntax.",
        line: location.line,
        column: location.column,
        source: "latex",
        rawExcerpt: excerpt(lines, index, location.index),
      });
      continue;
    }

    const reference =
      /LaTeX Warning:\s*Reference [`'](.+?)[`'] .*undefined on input line (\d+)/iu.exec(
        trimmed,
      );
    if (reference !== null) {
      add({
        severity: "warning",
        message: `Reference "${reference[1] ?? ""}" is undefined.`,
        line: positiveInteger(reference[2]),
        source: "latex",
        rawExcerpt: trimmed,
      });
      continue;
    }

    const citation =
      /(?:LaTeX|Package .+?) Warning:\s*Citation [`'](.+?)[`'] .*undefined on input line (\d+)/iu.exec(
        trimmed,
      );
    if (citation !== null) {
      add({
        severity: "warning",
        message: `Citation "${citation[1] ?? ""}" is undefined.`,
        line: positiveInteger(citation[2]),
        source: "latex",
        rawExcerpt: trimmed,
      });
      continue;
    }

    if (/LaTeX Warning:\s*There were undefined references\./iu.test(trimmed)) {
      add({
        severity: "warning",
        message:
          "The document contains undefined references. Rebuild after correcting labels or references.",
        source: "latex",
        rawExcerpt: trimmed,
      });
      continue;
    }

    const box =
      /^(Overfull|Underfull) \\[hv]box .*? at lines? (\d+)(?:--(\d+))?/iu.exec(
        trimmed,
      );
    if (box !== null) {
      const kind =
        box[1]?.toLowerCase() === "overfull" ? "Overfull" : "Underfull";
      add({
        severity: "warning",
        message: `${kind} box detected; inspect the affected paragraph or alignment.`,
        line: positiveInteger(box[2]),
        source: "latex",
        rawExcerpt: trimmed,
      });
      continue;
    }

    const packageWarning =
      /^Package\s+(.+?)\s+Warning:\s*(.+?)(?:\s+on input line (\d+)\.)?$/iu.exec(
        trimmed,
      );
    if (packageWarning !== null) {
      add({
        severity: "warning",
        message: `${packageWarning[1] ?? "Package"}: ${packageWarning[2] ?? "warning"}`,
        line: positiveInteger(packageWarning[3]),
        source: "latex",
        rawExcerpt: trimmed,
      });
      continue;
    }

    const latexmkMissing =
      /^Latexmk:\s*Missing input file [`'](.+?)[`']/iu.exec(trimmed);
    if (latexmkMissing !== null) {
      add({
        severity: "error",
        message: missingFileMessage(latexmkMissing[1] ?? "input file"),
        file: resolveKnownFile(latexmkMissing[1] ?? "", knownFiles),
        source: "latexmk",
        rawExcerpt: trimmed,
      });
      continue;
    }

    const biber = /^(ERROR|WARN|INFO)\s*-\s*(.+)$/u.exec(trimmed);
    if (biber !== null) {
      add({
        severity:
          biber[1] === "ERROR"
            ? "error"
            : biber[1] === "WARN"
              ? "warning"
              : "info",
        message: biber[2] ?? "Biber message.",
        file: fileMentionedByMessage(biber[2] ?? "", knownFiles),
        source: "biber",
        rawExcerpt: trimmed,
      });
      continue;
    }

    if (/^I couldn't open database file /iu.test(trimmed)) {
      const file = trimmed
        .replace(/^I couldn't open database file /iu, "")
        .trim();
      add({
        severity: "error",
        message: `BibTeX could not open database file "${file}". Check the bibliography path and file name.`,
        file: resolveKnownFile(file, knownFiles),
        source: "bibtex",
        rawExcerpt: trimmed,
      });
      continue;
    }

    const bibtexWarning = /^Warning--(.+)$/iu.exec(trimmed);
    if (bibtexWarning !== null) {
      add({
        severity: "warning",
        message: bibtexWarning[1] ?? "BibTeX warning.",
        source: "bibtex",
        rawExcerpt: trimmed,
      });
    }
  }

  addStatusDiagnostic(input, add);
  if (
    input.status === "failed" &&
    diagnostics.length > 0 &&
    !diagnostics.some((diagnostic) => diagnostic.severity === "error")
  ) {
    if (diagnostics.length >= MAX_DIAGNOSTICS) {
      diagnostics.pop();
    }
    add({
      severity: "error",
      message:
        "The build failed after emitting messages that did not identify the fatal error. Inspect the raw build log.",
      source: "system",
      rawExcerpt:
        firstNonEmptyLogLine(input.log) ??
        input.failureReason ??
        "No compiler output was available.",
    });
  }
  if (diagnostics.length === 0) {
    return fallbackDiagnostics(input);
  }
  return diagnostics;
}

function addStatusDiagnostic(
  input: ParseBuildDiagnosticsInput,
  add: (candidate: DiagnosticCandidate) => void,
): void {
  if (input.status === "timed-out") {
    add({
      severity: "error",
      message:
        "Compilation timed out. Inspect the raw log for a loop, missing input, or stalled package prompt.",
      source: "system",
      rawExcerpt: input.failureReason ?? "Compilation timed out.",
    });
  } else if (input.status === "cancelled") {
    add({
      severity: "info",
      message: "Compilation was cancelled before it completed.",
      source: "system",
      rawExcerpt: input.failureReason ?? "Compilation cancelled.",
    });
  }
}

function fallbackDiagnostics(
  input: ParseBuildDiagnosticsInput,
): BuildDiagnostic[] {
  if (input.status === "succeeded" || input.status === "superseded") {
    return [];
  }
  const rawExcerpt =
    firstNonEmptyLogLine(input.log) ??
    input.failureReason ??
    "No compiler output was available.";
  return [
    normalizeDiagnostic(
      {
        severity: input.status === "cancelled" ? "info" : "error",
        message:
          input.status === "cancelled"
            ? "Compilation was cancelled before it completed."
            : input.status === "timed-out"
              ? "Compilation timed out. Inspect the raw log for the operation that did not finish."
              : "The build failed, but the log format was not recognized. Inspect the raw build log.",
        source: "system",
        rawExcerpt,
      },
      normalizeKnownFiles(input.projectFiles),
      input.rootFile,
    ),
  ];
}

function normalizeDiagnostic(
  candidate: DiagnosticCandidate,
  knownFiles: readonly string[],
  currentFile: string | null,
): BuildDiagnostic {
  return {
    severity: candidate.severity,
    message: truncate(candidate.message.trim(), MAX_MESSAGE_CHARACTERS),
    file:
      candidate.file === null
        ? null
        : resolveKnownFile(candidate.file ?? currentFile ?? "", knownFiles),
    line: positiveInteger(candidate.line),
    column: positiveInteger(candidate.column),
    source: candidate.source,
    rawExcerpt: truncate(candidate.rawExcerpt.trim(), MAX_EXCERPT_CHARACTERS),
  };
}

function matchFileDiagnostic(
  lines: readonly string[],
  index: number,
  knownFiles: readonly string[],
): DiagnosticCandidate | null {
  const line = lines[index]?.trim() ?? "";
  const match =
    /^(.+?\.(?:bib|cls|sty|tex)):(\d+)(?::(\d+))?:\s*(?:(error|warning|info):\s*)?(.+)$/iu.exec(
      line,
    );
  if (match === null) {
    return null;
  }
  if (/^==>$/u.test((match[5] ?? "").trim())) {
    return null;
  }
  const messageResult = wrappedFileDiagnosticMessage(
    lines,
    index,
    match[5] ?? "Compiler message.",
  );
  const message = messageResult.message;
  const explicitSeverity = match[4]?.toLowerCase();
  const severity: DiagnosticSeverity =
    explicitSeverity === "warning"
      ? "warning"
      : explicitSeverity === "info"
        ? "info"
        : /warning/iu.test(message)
          ? "warning"
          : "error";
  return {
    severity,
    message,
    file: resolveKnownFile(match[1] ?? "", knownFiles),
    line: positiveInteger(match[2]),
    column: positiveInteger(match[3]),
    source: "latex",
    rawExcerpt: messageResult.rawExcerpt,
  };
}

function wrappedFileDiagnosticMessage(
  lines: readonly string[],
  index: number,
  initialMessage: string,
): { message: string; rawExcerpt: string } {
  let message = initialMessage;
  const excerpt = [lines[index] ?? ""];
  if (
    (lines[index]?.length ?? 0) < 79 ||
    /[.!?]$/u.test(initialMessage.trim())
  ) {
    return { message: message.trim(), rawExcerpt: excerpt[0]?.trim() ?? "" };
  }

  for (
    let candidateIndex = index + 1;
    candidateIndex <= Math.min(lines.length - 1, index + 3);
    candidateIndex += 1
  ) {
    const candidate = lines[candidateIndex] ?? "";
    const trimmed = candidate.trim();
    if (
      trimmed === "" ||
      /^l\.\d+/u.test(trimmed) ||
      /^.+?\.(?:bib|cls|sty|tex):\d+/iu.test(trimmed)
    ) {
      break;
    }
    message += candidate.trimStart();
    excerpt.push(candidate);
    if (/[.!?]$/u.test(trimmed)) {
      break;
    }
  }
  return {
    message: message.trim(),
    rawExcerpt: excerpt.join("\n").trim(),
  };
}

function followingLatexLocation(
  lines: readonly string[],
  index: number,
): { line: number | null; column: number | null; index: number } {
  for (
    let candidateIndex = index + 1;
    candidateIndex <= Math.min(lines.length - 1, index + 8);
    candidateIndex += 1
  ) {
    const candidate = lines[candidateIndex] ?? "";
    const match = /^\s*l\.(\d+)\s*(.*)$/u.exec(candidate);
    if (match !== null) {
      const source = match[2] ?? "";
      const firstText = source.search(/\S/u);
      return {
        line: positiveInteger(match[1]),
        column: firstText < 0 ? null : firstText + 1,
        index: candidateIndex,
      };
    }
  }
  return { line: null, column: null, index };
}

function filesOpenedByLine(
  line: string,
  knownFiles: readonly string[],
): string[] {
  const files: string[] = [];
  const pattern = /\((?:\.\/)?([^()\s]+?\.(?:bib|cls|sty|tex))/giu;
  for (const match of line.matchAll(pattern)) {
    const file = resolveKnownFile(match[1] ?? "", knownFiles);
    if (file !== null) {
      files.push(file);
    }
  }
  return files;
}

function fileMentionedByMessage(
  message: string,
  knownFiles: readonly string[],
): string | null {
  const candidates = message.match(/[^\s"'`]+?\.(?:bib|cls|sty|tex)/giu) ?? [];
  for (const candidate of candidates) {
    const file = resolveKnownFile(candidate, knownFiles);
    if (file !== null) {
      return file;
    }
  }
  return null;
}

function normalizeKnownFiles(projectFiles: readonly string[]): string[] {
  return [...new Set(projectFiles.map(normalizePortablePath))]
    .filter((path) => path !== "" && PROJECT_FILE_PATTERN.test(path))
    .sort((left, right) => right.length - left.length);
}

function resolveKnownFile(
  candidate: string,
  knownFiles: readonly string[],
): string | null {
  const normalized = normalizePortablePath(candidate);
  if (normalized === "") {
    return null;
  }
  const key = normalized.toLocaleLowerCase("en-US");
  return (
    knownFiles.find((file) => {
      const fileKey = file.toLocaleLowerCase("en-US");
      return key === fileKey || key.endsWith(`/${fileKey}`);
    }) ?? null
  );
}

function normalizePortablePath(path: string): string {
  return path
    .trim()
    .replace(/^["'`]+|["'`,:;]+$/gu, "")
    .replaceAll("\\", "/")
    .replace(/^(?:\.\/)+/u, "")
    .replace(/\/+/gu, "/");
}

function explainLatexError(message: string): string {
  const missing = /File [`'](.+?)[`'] not found\./iu.exec(message);
  return missing === null
    ? message
    : missingFileMessage(missing[1] ?? "input file");
}

function missingFileMessage(file: string): string {
  const packageName = file.replace(/\.(?:cls|sty)$/iu, "");
  return `Required LaTeX file or package "${file}" was not found. Install "${packageName}" with MiKTeX or correct the document path.`;
}

function excerpt(
  lines: readonly string[],
  startIndex: number,
  endIndex: number,
): string {
  return lines.slice(startIndex, Math.max(startIndex, endIndex) + 1).join("\n");
}

function positiveInteger(
  value: number | string | null | undefined,
): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 3)}...`;
}

function firstNonEmptyLogLine(log: string): string | null {
  return (
    log
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find((line) => line !== "") ?? null
  );
}
