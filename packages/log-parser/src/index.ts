import type { DiagnosticItem } from "@texpulse/shared";
import {
  BibLogParser,
  type BibLogParseOptions,
  type ParsedBibLogEntry,
} from "./bib-log-parser.js";
import {
  COMMAND_PACKAGE_SUGGESTIONS,
  ENVIRONMENT_PACKAGE_SUGGESTIONS,
  HumanReadableLogsPackageSuggestions,
  HumanReadableLogsRules,
  explainDiagnostic,
  type HumanReadableLogRule,
} from "./human-readable-logs.js";
import {
  LatexLogParser,
  normalizeLogFilePath,
  type LatexLogParseOptions,
  type ParsedLatexLogEntry,
  type ParsedLatexLogResult,
} from "./latex-log-parser.js";

export interface SettledLogsInput {
  logText: string;
  blgText?: string | undefined;
  rootFile?: string | undefined;
  ignoreDuplicates?: boolean | undefined;
  bibContentByPath?: Readonly<Record<string, string>> | undefined;
  texContentByPath?: Readonly<Record<string, string>> | undefined;
}

const CATEGORY_ORDER: Record<DiagnosticItem["category"], number> = {
  error: 0,
  warning: 1,
  typesetting: 2,
};

/**
 * Parses settled `.log` and `.blg` files from disk and attaches Overleaf-style
 * plain-English explanations and CTAN package quick-fix actions.
 */
export function parseSettledLogs(input: SettledLogsInput): DiagnosticItem[] {
  const rootFile = normalizeLogFilePath(input.rootFile ?? "main.tex", "main.tex");
  const ignoreDuplicates = input.ignoreDuplicates ?? true;

  const latexResult = LatexLogParser.parse(input.logText, {
    ignoreDuplicates,
    rootFile,
  });

  const bibEntries = BibLogParser.parse(input.blgText ?? "", {
    ignoreDuplicates,
    rootTexFile: rootFile,
    bibContentByPath: input.bibContentByPath,
    texContentByPath: input.texContentByPath,
  });

  const items: DiagnosticItem[] = [];
  latexResult.all.forEach((entry, idx) => {
    items.push(explainDiagnostic(entry, "latex-log", idx, rootFile));
  });
  bibEntries.forEach((entry, idx) => {
    items.push(explainDiagnostic(entry, "bib-log", idx, rootFile));
  });

  items.sort((a, b) => {
    const catDiff = CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
    if (catDiff !== 0) return catDiff;
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return a.line - b.line;
  });

  return items;
}

export {
  BibLogParser,
  COMMAND_PACKAGE_SUGGESTIONS,
  ENVIRONMENT_PACKAGE_SUGGESTIONS,
  HumanReadableLogsPackageSuggestions,
  HumanReadableLogsRules,
  LatexLogParser,
  explainDiagnostic,
  normalizeLogFilePath,
  type BibLogParseOptions,
  type HumanReadableLogRule,
  type LatexLogParseOptions,
  type ParsedBibLogEntry,
  type ParsedLatexLogEntry,
  type ParsedLatexLogResult,
};
