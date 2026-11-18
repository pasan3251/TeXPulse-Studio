import type { DiagnosticCategory, DiagnosticSeverity } from "@texpulse/shared";
import { normalizeLogFilePath } from "./latex-log-parser.js";

export interface ParsedBibLogEntry {
  level: DiagnosticSeverity;
  category: DiagnosticCategory;
  message: string;
  file: string | null;
  line: number | null;
  raw: string;
  citationKey?: string | undefined;
  fieldName?: string | undefined;
}

export interface BibLogParseOptions {
  ignoreDuplicates?: boolean | undefined;
  defaultBibFile?: string | undefined;
  rootTexFile?: string | undefined;
  bibContentByPath?: Readonly<Record<string, string>> | undefined;
  texContentByPath?: Readonly<Record<string, string>> | undefined;
}

const DATABASE_FILE_RE = /^Database file #\d+:\s*([^\r\n]+)$/u;
const MISSING_ENTRY_RE =
  /^Warning--I didn't find a database entry for\s+"([^"]+)"/iu;
const EMPTY_FIELD_RE = /^Warning--empty\s+([^\s]+)\s+in\s+([^\s]+)/iu;
const GENERIC_BIB_WARNING_RE = /^Warning--(.+)$/u;
const BIB_LINE_ERROR_RE = /^(.+?)---line\s+(\d+)\s+of\s+file\s+([^\r\n]+)$/iu;
const BIB_READING_FILE_ERROR_RE =
  /^(.+?)---while reading file\s+([^\r\n]+)$/iu;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function findBibEntryLocation(
  key: string,
  fallbackBibFile: string,
  bibContentByPath?: Readonly<Record<string, string>>,
): { file: string; line: number } {
  if (!bibContentByPath) {
    return { file: fallbackBibFile, line: 1 };
  }
  const entryRe = new RegExp(
    `^\\s*@[A-Za-z]+\\s*\\{\\s*${escapeRegex(key)}\\s*,`,
    "iu",
  );
  for (const [path, content] of Object.entries(bibContentByPath)) {
    const lines = content.split(/\r?\n/u);
    for (let i = 0; i < lines.length; i += 1) {
      if (entryRe.test(lines[i] ?? "")) {
        return { file: path, line: i + 1 };
      }
    }
  }
  return { file: fallbackBibFile, line: 1 };
}

function findCitationCallLocation(
  key: string,
  fallbackTexFile: string,
  texContentByPath?: Readonly<Record<string, string>>,
): { file: string; line: number } {
  if (!texContentByPath) {
    return { file: fallbackTexFile, line: 1 };
  }
  const citeRe = new RegExp(
    `\\\\(?:[a-zA-Z]*cite[a-zA-Z]*)(?:\\[[^\\]]*\\])*\\{[^}]*\\b${escapeRegex(key)}\\b[^}]*\\}`,
    "u",
  );
  for (const [path, content] of Object.entries(texContentByPath)) {
    const lines = content.split(/\r?\n/u);
    for (let i = 0; i < lines.length; i += 1) {
      if (citeRe.test(lines[i] ?? "")) {
        return { file: path, line: i + 1 };
      }
    }
  }
  return { file: fallbackTexFile, line: 1 };
}

/**
 * Deterministic parser for settled BibTeX `.blg` log files from disk.
 */
export class BibLogParser {
  static parse(
    blgText: string,
    options: BibLogParseOptions = {},
  ): ParsedBibLogEntry[] {
    if (!blgText.trim()) return [];

    const ignoreDuplicates = options.ignoreDuplicates ?? true;
    const rootTexFile = normalizeLogFilePath(options.rootTexFile ?? "main.tex", "main.tex");
    let activeBibFile = normalizeLogFilePath(
      options.defaultBibFile ?? "references.bib",
      "references.bib",
    );

    const results: ParsedBibLogEntry[] = [];
    const seenKeys = new Set<string>();

    const record = (entry: ParsedBibLogEntry): void => {
      const normalizedFile = entry.file ?? rootTexFile;
      const dedupeKey = `${entry.category}|${normalizedFile}|${String(entry.line ?? 0)}|${entry.message}`;
      if (ignoreDuplicates && seenKeys.has(dedupeKey)) {
        return;
      }
      seenKeys.add(dedupeKey);
      results.push({ ...entry, file: normalizedFile });
    };

    const lines = blgText.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      const line = (lines[i] ?? "").trim();
      if (!line) continue;

      const dbMatch = DATABASE_FILE_RE.exec(line);
      if (dbMatch?.[1]) {
        activeBibFile = normalizeLogFilePath(dbMatch[1], activeBibFile);
        continue;
      }

      const lineErrMatch = BIB_LINE_ERROR_RE.exec(line);
      if (lineErrMatch) {
        const message = lineErrMatch[1]!.trim();
        const lineNo = Number.parseInt(lineErrMatch[2]!, 10);
        const rawFile = lineErrMatch[3]!.trim();
        const contextLines = [line];
        if (i + 1 < lines.length && lines[i + 1]?.trim().startsWith(":")) {
          contextLines.push(lines[i + 1]!);
          if (i + 2 < lines.length && lines[i + 2]?.trim() !== "") {
            contextLines.push(lines[i + 2]!);
          }
        }
        record({
          level: "error",
          category: "error",
          message,
          file: normalizeLogFilePath(rawFile, activeBibFile),
          line: Number.isFinite(lineNo) && lineNo > 0 ? lineNo : 1,
          raw: contextLines.join("\n"),
        });
        continue;
      }

      const readingErrMatch = BIB_READING_FILE_ERROR_RE.exec(line);
      if (readingErrMatch) {
        const message = readingErrMatch[1]!.trim();
        const rawFile = normalizeLogFilePath(readingErrMatch[2]!.trim(), rootTexFile);
        const mappedFile = rawFile.endsWith(".bib") ? rawFile : rootTexFile;
        record({
          level: "error",
          category: "error",
          message,
          file: mappedFile,
          line: 1,
          raw: line,
        });
        continue;
      }

      const missingMatch = MISSING_ENTRY_RE.exec(line);
      if (missingMatch?.[1]) {
        const citationKey = missingMatch[1].trim();
        const loc = findCitationCallLocation(
          citationKey,
          rootTexFile,
          options.texContentByPath,
        );
        record({
          level: "warning",
          category: "warning",
          message: `I didn't find a database entry for "${citationKey}"`,
          file: loc.file,
          line: loc.line,
          raw: line,
          citationKey,
        });
        continue;
      }

      const emptyFieldMatch = EMPTY_FIELD_RE.exec(line);
      if (emptyFieldMatch?.[1] && emptyFieldMatch[2]) {
        const fieldName = emptyFieldMatch[1].trim();
        const citationKey = emptyFieldMatch[2].trim();
        const loc = findBibEntryLocation(
          citationKey,
          activeBibFile,
          options.bibContentByPath,
        );
        record({
          level: "warning",
          category: "warning",
          message: `empty ${fieldName} in ${citationKey}`,
          file: loc.file,
          line: loc.line,
          raw: line,
          citationKey,
          fieldName,
        });
        continue;
      }

      const genericWarnMatch = GENERIC_BIB_WARNING_RE.exec(line);
      if (genericWarnMatch?.[1]) {
        record({
          level: "warning",
          category: "warning",
          message: genericWarnMatch[1].trim(),
          file: activeBibFile,
          line: 1,
          raw: line,
        });
      }
    }

    return results;
  }
}
