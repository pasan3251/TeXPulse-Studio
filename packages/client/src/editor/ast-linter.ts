import type { Diagnostic } from "@codemirror/lint";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type {
  DiagnosticItem,
  EditorDiagnostic,
  ProjectSymbolIndex,
} from "@texpulse/shared";
import { latexLinter } from "codemirror-lang-latex";

const MISSING_REF_RE = /^Undefined reference:\\?\s*([^\s]+)|^Reference ['`"]([^'"`]+)['`"] is not defined/iu;
const REF_CALL_RE = /\\(?:ref|eqref|autoref|cref|Cref|pageref|vref)\{([^}\s]+)\}/gu;

function offsetToLineCol(docText: string, offset: number): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(offset, docText.length));
  const before = docText.slice(0, clamped);
  const lines = before.split("\n");
  const lastLine = lines.at(-1) ?? "";
  return { line: lines.length, column: lastLine.length + 1 };
}

function classifyRuleId(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("document environment") || lower.includes("\\begin{document}")) {
    return "missing-document-env";
  }
  if (lower.includes("unmatched") || lower.includes("\\begin") || lower.includes("\\end")) {
    return "unmatched-environment";
  }
  if (lower.includes("brace")) {
    return "unclosed-brace";
  }
  if (lower.includes("reference") || lower.includes("label")) {
    return "undefined-reference";
  }
  return "latex-ast-lint";
}

function checkCrossFileReferences(
  docText: string,
  symbolIndex: ProjectSymbolIndex,
): EditorDiagnostic[] {
  const knownLabels = new Set(symbolIndex.labels.map((label) => label.key));
  const diagnostics: EditorDiagnostic[] = [];

  for (const match of docText.matchAll(REF_CALL_RE)) {
    const key = match[1]?.trim();
    if (!key || knownLabels.has(key)) continue;
    const from = match.index ?? 0;
    const to = from + match[0].length;
    const { line, column } = offsetToLineCol(docText, from);
    diagnostics.push({
      id: `undefined-reference-${key}-${String(from)}`,
      severity: "warning",
      category: "warning",
      source: "ast",
      message: `Reference "${key}" is not defined in any open workspace .tex file.`,
      humanTitle: `Undefined reference: ${key}`,
      explanation: `Add \\label{${key}} or select a defined label via \\ref{ autocomplete.`,
      from,
      to,
      line,
      column,
      ruleId: "undefined-reference",
      quickFixHint: `Add \\label{${key}} or select a defined label via \\ref{ autocomplete.`,
    });
  }

  return diagnostics;
}

function checkBraceBalanceFallback(state: EditorState): EditorDiagnostic[] {
  const docText = state.doc.toString();
  const stack: number[] = [];
  const diagnostics: EditorDiagnostic[] = [];
  let inComment = false;
  let escaped = false;

  for (let i = 0; i < docText.length; i += 1) {
    const ch = docText[i];
    if (ch === "\n") {
      inComment = false;
      escaped = false;
      continue;
    }
    if (inComment) continue;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === "%") {
      inComment = true;
      continue;
    }
    if (ch === "{") {
      stack.push(i);
    } else if (ch === "}") {
      if (stack.length === 0) {
        const { line, column } = offsetToLineCol(docText, i);
        diagnostics.push({
          id: `unmatched-close-brace-${String(i)}`,
          severity: "error",
          message: "Unmatched closing brace `}`.",
          from: i,
          to: i + 1,
          line,
          column,
          ruleId: "unclosed-brace",
        });
      } else {
        stack.pop();
      }
    }
  }

  for (const openOffset of stack) {
    const { line, column } = offsetToLineCol(docText, openOffset);
    diagnostics.push({
      id: `unclosed-brace-${String(openOffset)}`,
      severity: "error",
      message: "Unclosed opening brace `{`.",
      from: openOffset,
      to: openOffset + 1,
      line,
      column,
      ruleId: "unclosed-brace",
    });
  }

  return diagnostics;
}

/**
 * Runs CodeMirror 6's Lezer-backed `latexLinter` plus workspace-wide `\ref`
 * resolution so multi-file `\label` targets (e.g., `chapters/*.tex`) do not
 * emit false positives while missing labels and structural errors are flagged.
 */
export function runAstLinter(
  view: EditorView,
  filePath: string,
  symbolIndex: ProjectSymbolIndex,
  onDiagnosticsChange?: (diagnostics: EditorDiagnostic[]) => void,
): Diagnostic[] {
  const isTexFile = filePath.toLowerCase().endsWith(".tex");
  if (!isTexFile) {
    onDiagnosticsChange?.([]);
    return [];
  }

  const docText = view.state.doc.toString();
  ensureSyntaxTree(view.state, view.state.doc.length, 300);
  const isRootDocument =
    filePath === "main.tex" ||
    /\\documentclass\b/u.test(docText);

  const baseRunner = latexLinter({
    checkMissingDocumentEnv: isRootDocument,
    checkUnmatchedEnvironments: true,
    checkMissingReferences: false,
    checkUnclosedBraces: true,
    checkDuplicateLabels: true,
    checkCitesWithoutBibliography: false,
    checkMathModeCommands: true,
    checkDeprecatedCommands: true,
    checkMissingPackages: true,
    fileName: filePath,
  });

  const knownLabels = new Set(symbolIndex.labels.map((l) => l.key));
  const seenKeys = new Set<string>();
  const collected: EditorDiagnostic[] = [];

  const pushDiag = (item: EditorDiagnostic): void => {
    const key = `${item.ruleId}:${String(item.from)}:${item.message}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    collected.push(item);
  };

  for (const raw of baseRunner(view)) {
    const refMatch = MISSING_REF_RE.exec(raw.message);
    if (refMatch) {
      const labelKey = (refMatch[1] ?? refMatch[2] ?? "").trim();
      if (knownLabels.has(labelKey)) continue;
    }

    const { line, column } = offsetToLineCol(docText, raw.from);
    const sev = raw.severity === "error" ? "error" : raw.severity === "warning" ? "warning" : "info";
    pushDiag({
      id: `${classifyRuleId(raw.message)}-${String(raw.from)}`,
      severity: sev,
      category: sev === "error" ? "error" : "warning",
      source: "ast",
      filePath,
      message: raw.message,
      humanTitle: raw.message,
      explanation: raw.message,
      from: raw.from,
      to: raw.to,
      line,
      column,
      ruleId: classifyRuleId(raw.message),
    });
  }

  for (const diag of checkCrossFileReferences(docText, symbolIndex)) {
    pushDiag({ ...diag, filePath });
  }

  // Ensure unclosed braces trigger reliably even if syntaxTree has incomplete recovery
  if (!collected.some((d) => d.ruleId === "unclosed-brace")) {
    for (const braceDiag of checkBraceBalanceFallback(view.state)) {
      pushDiag({
        ...braceDiag,
        category: "error",
        source: "ast",
        filePath,
        humanTitle: braceDiag.message,
        explanation: braceDiag.message,
      });
    }
  }

  // Verify AST tree exists (useful sanity check for callers)
  void syntaxTree(view.state);

  collected.sort((a, b) => a.from - b.from);
  onDiagnosticsChange?.(collected);

  return collected.map((d) => ({
    from: d.from,
    to: Math.max(d.to, d.from),
    severity: d.severity,
    message: d.message,
    source: d.ruleId,
  }));
}

function lineSpanInState(
  state: EditorState,
  lineNumber: number,
  commandToken?: string,
): { from: number; to: number } {
  const clampedLine = Math.max(1, Math.min(lineNumber, state.doc.lines));
  const lineObj = state.doc.line(clampedLine);
  const text = lineObj.text;

  if (commandToken) {
    const tokenIdx = text.indexOf(commandToken);
    if (tokenIdx !== -1) {
      return {
        from: lineObj.from + tokenIdx,
        to: lineObj.from + tokenIdx + commandToken.length,
      };
    }
  }

  const leadingSpaces = text.search(/\S/u);
  const from = leadingSpaces === -1 ? lineObj.from : lineObj.from + leadingSpaces;
  const to = Math.max(from, lineObj.to);
  return { from, to: to > from ? to : Math.min(state.doc.length, from + 1) };
}

/**
 * Maps settled compiler diagnostics (`DiagnosticItem[]`) for `filePath` into
 * CodeMirror 6 `@codemirror/lint` diagnostics (`Diagnostic[]`) and merges them
 * with live AST lint results so both gutter markers and wavy inline squiggles
 * render immediately after compilation.
 */
export function computeMergedCodeMirrorDiagnostics(
  view: EditorView,
  filePath: string,
  symbolIndex: ProjectSymbolIndex,
  compilerDiagnostics: readonly DiagnosticItem[],
  onAstDiagnosticsChange?: (diagnostics: EditorDiagnostic[]) => void,
): Diagnostic[] {
  const astCm = runAstLinter(view, filePath, symbolIndex, onAstDiagnosticsChange);
  const activeCompilerItems = compilerDiagnostics.filter((d) => d.file === filePath);
  if (activeCompilerItems.length === 0) {
    return astCm;
  }

  const compilerLines = new Set(activeCompilerItems.map((d) => d.line));
  const filteredAstCm = astCm.filter((cmDiag) => {
    const lineNo = view.state.doc.lineAt(cmDiag.from).number;
    return !compilerLines.has(lineNo);
  });

  const compilerCm: Diagnostic[] = activeCompilerItems.map((item) => {
    const span = lineSpanInState(view.state, item.line, item.quickFix?.command);
    const severity: Diagnostic["severity"] =
      item.category === "error"
        ? "error"
        : item.category === "warning"
          ? "warning"
          : "info";
    return {
      from: span.from,
      to: span.to,
      severity,
      message: `${item.humanTitle}\n${item.explanation}`,
      source: item.ruleId,
    };
  });

  return [...compilerCm, ...filteredAstCm].sort((a, b) => a.from - b.from);
}
