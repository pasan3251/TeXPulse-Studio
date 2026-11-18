import type {
  DiagnosticItem,
  DiagnosticSource,
  PackageSuggestionAction,
} from "@texpulse/shared";
import type { ParsedBibLogEntry } from "./bib-log-parser.js";
import type { ParsedLatexLogEntry } from "./latex-log-parser.js";

export interface HumanReadableLogRule {
  id: string;
  pattern: RegExp;
  buildTitle: (
    match: RegExpMatchArray,
    entry: ParsedLatexLogEntry | ParsedBibLogEntry,
  ) => string;
  buildExplanation: (
    match: RegExpMatchArray,
    entry: ParsedLatexLogEntry | ParsedBibLogEntry,
    quickFix?: PackageSuggestionAction,
  ) => string;
}

/**
 * Command-to-CTAN package lookup table ported from Overleaf's
 * HumanReadableLogs package-suggestion catalog.
 */
export const COMMAND_PACKAGE_SUGGESTIONS: Readonly<Record<string, string>> = {
  "\\toprule": "booktabs",
  "\\midrule": "booktabs",
  "\\bottomrule": "booktabs",
  "\\cmidrule": "booktabs",
  "\\addlinespace": "booktabs",
  "\\includegraphics": "graphicx",
  "\\rotatebox": "graphicx",
  "\\scalebox": "graphicx",
  "\\resizebox": "graphicx",
  "\\graphicspath": "graphicx",
  "\\url": "hyperref",
  "\\href": "hyperref",
  "\\autoref": "hyperref",
  "\\hypersetup": "hyperref",
  "\\texorpdfstring": "hyperref",
  "\\mathbb": "amssymb",
  "\\mathcal": "amssymb",
  "\\mathfrak": "amssymb",
  "\\leqslant": "amssymb",
  "\\geqslant": "amssymb",
  "\\checkmark": "amssymb",
  "\\nexists": "amssymb",
  "\\varnothing": "amssymb",
  "\\text": "amsmath",
  "\\eqref": "amsmath",
  "\\operatorname": "amsmath",
  "\\DeclareMathOperator": "amsmath",
  "\\binom": "amsmath",
  "\\tfrac": "amsmath",
  "\\dfrac": "amsmath",
  "\\substack": "amsmath",
  "\\SI": "siunitx",
  "\\si": "siunitx",
  "\\num": "siunitx",
  "\\ang": "siunitx",
  "\\qty": "siunitx",
  "\\unit": "siunitx",
  "\\sisetup": "siunitx",
  "\\textcolor": "xcolor",
  "\\colorbox": "xcolor",
  "\\definecolor": "xcolor",
  "\\color": "xcolor",
  "\\pagecolor": "xcolor",
  "\\multirow": "multirow",
  "\\captionof": "caption",
  "\\FloatBarrier": "placeins",
  "\\cref": "cleveref",
  "\\Cref": "cleveref",
};

/**
 * Environment-to-CTAN package lookup table.
 */
export const ENVIRONMENT_PACKAGE_SUGGESTIONS: Readonly<Record<string, string>> = {
  align: "amsmath",
  "align*": "amsmath",
  alignat: "amsmath",
  "alignat*": "amsmath",
  flalign: "amsmath",
  "flalign*": "amsmath",
  gather: "amsmath",
  "gather*": "amsmath",
  multline: "amsmath",
  "multline*": "amsmath",
  pmatrix: "amsmath",
  bmatrix: "amsmath",
  Bmatrix: "amsmath",
  vmatrix: "amsmath",
  Vmatrix: "amsmath",
  cases: "amsmath",
  split: "amsmath",
  subequations: "amsmath",
  longtable: "longtable",
  tabularx: "tabularx",
  lstlisting: "listings",
  algorithm: "algorithm",
  algorithmic: "algpseudocode",
  tikzpicture: "tikz",
  subfigure: "subcaption",
  subtable: "subcaption",
};

export const HumanReadableLogsPackageSuggestions = {
  suggestForEntry(
    entry: ParsedLatexLogEntry | ParsedBibLogEntry,
  ): PackageSuggestionAction | undefined {
    const latexEntry = entry as ParsedLatexLogEntry;
    const commandToken = latexEntry.commandToken?.trim();
    if (commandToken && commandToken in COMMAND_PACKAGE_SUGGESTIONS) {
      const packageName = COMMAND_PACKAGE_SUGGESTIONS[commandToken]!;
      return {
        type: "insert-package",
        packageName,
        command: commandToken,
        description: `Insert \\usepackage{${packageName}} into your document preamble for ${commandToken}.`,
      };
    }

    const envName = latexEntry.environmentName?.trim();
    if (envName && envName in ENVIRONMENT_PACKAGE_SUGGESTIONS) {
      const packageName = ENVIRONMENT_PACKAGE_SUGGESTIONS[envName]!;
      return {
        type: "insert-package",
        packageName,
        command: `\\begin{${envName}}`,
        description: `Insert \\usepackage{${packageName}} into your document preamble for the "${envName}" environment.`,
      };
    }

    return undefined;
  },
};

export const HumanReadableLogsRules: readonly HumanReadableLogRule[] = [
  {
    id: "undefined-control-sequence",
    pattern: /^Undefined control sequence\.?$/iu,
    buildTitle(_match, entry) {
      const cmd = (entry as ParsedLatexLogEntry).commandToken;
      return cmd ? `Undefined command: ${cmd}` : "Undefined control sequence";
    },
    buildExplanation(_match, entry, quickFix) {
      const cmd = (entry as ParsedLatexLogEntry).commandToken;
      if (quickFix) {
        return `LaTeX does not recognize ${cmd ?? "this command"}. It is provided by the "${quickFix.packageName}" package—add \\usepackage{${quickFix.packageName}} to your preamble.`;
      }
      return `LaTeX encountered ${cmd ? `the command ${cmd}` : "a command"} that has not been defined. Check for a typo or add the required \\usepackage{...} in your preamble.`;
    },
  },
  {
    id: "environment-undefined",
    pattern: /LaTeX Error:\s*Environment\s+([^\s]+)\s+undefined/iu,
    buildTitle(match) {
      return `Undefined environment: ${match[1] ?? "unknown"}`;
    },
    buildExplanation(match, _entry, quickFix) {
      const env = match[1] ?? "this";
      if (quickFix) {
        return `The "${env}" environment requires \\usepackage{${quickFix.packageName}} in your preamble before \\begin{document}.`;
      }
      return `The "${env}" environment has not been declared. Verify the environment name or load the package that provides it.`;
    },
  },
  {
    id: "missing-dollar",
    pattern: /^Missing \$ inserted\.?$/iu,
    buildTitle() {
      return "Math symbol used outside math mode";
    },
    buildExplanation() {
      return "LaTeX encountered a math-only token (such as ^, _, \\frac, or Greek letters) in regular text mode, or an unclosed $ delimiter. Wrap math expressions in $...$ or \\[...\\].";
    },
  },
  {
    id: "extra-alignment-tab",
    pattern: /^Extra alignment tab has been changed to \\cr\.?$/iu,
    buildTitle() {
      return "Too many & columns in table or align row";
    },
    buildExplanation() {
      return "A row inside tabular, array, or align contains more & separators than columns declared in the table header, or the previous row is missing a trailing \\\\.";
    },
  },
  {
    id: "missing-begin-document",
    pattern: /LaTeX Error:\s*Missing \\begin\{document\}/iu,
    buildTitle() {
      return "Missing \\begin{document} (or stray preamble text)";
    },
    buildExplanation() {
      return "Text or typesettable content appeared before \\begin{document}, or \\begin{document} itself is missing. Move prose after \\begin{document}.";
    },
  },
  {
    id: "file-not-found",
    pattern: /LaTeX Error:\s*File [`'"]([^'`"]+)[`'"] not found/iu,
    buildTitle(match) {
      return `File not found: ${match[1] ?? "unknown"}`;
    },
    buildExplanation(match) {
      const target = match[1] ?? "the referenced file";
      return `LaTeX could not find "${target}" in the project directory or local TeX distribution. Verify the relative path or package spelling.`;
    },
  },
  {
    id: "runaway-argument",
    pattern: /Runaway argument\?|File ended while scanning use of/iu,
    buildTitle() {
      return "Runaway argument (unclosed brace `{` or macro)";
    },
    buildExplanation() {
      return "A macro argument ran past the end of a paragraph or file because a closing brace `}` is missing.";
    },
  },
  {
    id: "too-many-braces",
    pattern: /^Too many \}'s\.?$/iu,
    buildTitle() {
      return "Extra closing brace `}`";
    },
    buildExplanation() {
      return "LaTeX found a closing curly brace `}` without a matching opening brace `{`.";
    },
  },
  {
    id: "missing-number",
    pattern: /^Missing number, treated as zero\.?$/iu,
    buildTitle() {
      return "Missing numeric length or argument";
    },
    buildExplanation() {
      return "A TeX dimension or counter command expected a number (e.g., 12pt or 0.5\\textwidth) but received something else.";
    },
  },
  {
    id: "undefined-reference",
    pattern: /Reference [`'"]([^'`"]+)[`'"] on page \S+ undefined/iu,
    buildTitle(match) {
      return `Undefined label reference: "${match[1] ?? ""}"`;
    },
    buildExplanation(match) {
      const label = match[1] ?? "";
      return `No matching \\label{${label}} was found, or another LaTeX pass is needed to resolve cross-references.`;
    },
  },
  {
    id: "undefined-citation",
    pattern: /Citation [`'"]([^'`"]+)[`'"] on page \S+ undefined/iu,
    buildTitle(match) {
      return `Undefined citation: "${match[1] ?? ""}"`;
    },
    buildExplanation(match) {
      const key = match[1] ?? "";
      return `Citation key "${key}" could not be resolved by BibTeX/LaTeX. Add the entry to references.bib and run a Full Build.`;
    },
  },
  {
    id: "bib-missing-entry",
    pattern: /I didn't find a database entry for "([^"]+)"/iu,
    buildTitle(match) {
      return `Missing bibliography entry: "${match[1] ?? ""}"`;
    },
    buildExplanation(match) {
      return `BibTeX could not find "@...{${match[1] ?? ""}, ...}" in any loaded .bib file.`;
    },
  },
  {
    id: "bib-empty-field",
    pattern: /^empty\s+([^\s]+)\s+in\s+([^\s]+)$/iu,
    buildTitle(match) {
      return `Missing BibTeX field "${match[1] ?? ""}" in "${match[2] ?? ""}"`;
    },
    buildExplanation(match) {
      return `The current bibliography style expects a non-empty "${match[1] ?? ""}" field on entry "${match[2] ?? ""}".`;
    },
  },
  {
    id: "bib-line-syntax-error",
    pattern: /(Repeated entry|I was expecting a ',' or a '\}'|"," immediately follows a field name)/iu,
    buildTitle(match) {
      return `BibTeX syntax issue: ${match[1] ?? "check entry"}`;
    },
    buildExplanation() {
      return "Check your .bib entry around this line for missing commas between fields, unclosed braces, or duplicate citation keys.";
    },
  },
  {
    id: "overfull-box",
    pattern: /^(Overfull|Underfull)\s+\\([hv]box)\s+\(([^)]+)\)/iu,
    buildTitle(match) {
      const kind = match[1] ?? "Overfull";
      const box = match[2] ?? "hbox";
      const amount = match[3] ?? "";
      return `${kind} \\${box} (${amount})`;
    },
    buildExplanation(match) {
      const kind = (match[1] ?? "Overfull").toLowerCase();
      return kind === "overfull"
        ? "Content extends past the right margin or page height. Consider rephrasing long inline words/URLs, breaking long equations, or resizing wide tables."
        : "TeX had to stretch whitespace more than usual to justify a line or fill a page.";
    },
  },
];

export function explainDiagnostic(
  entry: ParsedLatexLogEntry | ParsedBibLogEntry,
  source: DiagnosticSource,
  index: number,
  rootFile = "main.tex",
): DiagnosticItem {
  const quickFix = HumanReadableLogsPackageSuggestions.suggestForEntry(entry);
  const file = entry.file ?? rootFile;
  const line = entry.line && entry.line > 0 ? entry.line : 1;

  for (const rule of HumanReadableLogsRules) {
    const match = rule.pattern.exec(entry.message);
    if (match) {
      return {
        id: `${source}:${rule.id}:${file}:${String(line)}:${String(index)}`,
        severity: entry.level,
        category: entry.category,
        source,
        file,
        line,
        message: entry.message,
        humanTitle: rule.buildTitle(match, entry),
        explanation: rule.buildExplanation(match, entry, quickFix),
        rawLog: entry.raw,
        ruleId: rule.id,
        quickFix,
      };
    }
  }

  return {
    id: `${source}:generic:${file}:${String(line)}:${String(index)}`,
    severity: entry.level,
    category: entry.category,
    source,
    file,
    line,
    message: entry.message,
    humanTitle: entry.message,
    explanation:
      entry.category === "error"
        ? "TeX reported an error at this location. Expand the raw compiler excerpt below for full context."
        : entry.category === "warning"
          ? "TeX or BibTeX reported a warning that may affect references, layout, or citations."
          : "Typesetting notice reported by TeX.",
    rawLog: entry.raw,
    ruleId: source === "bib-log" ? "bib-warning-or-error" : "latex-log-diagnostic",
    quickFix,
  };
}
