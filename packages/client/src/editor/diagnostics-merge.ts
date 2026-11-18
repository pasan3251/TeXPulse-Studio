import type { DiagnosticItem, EditorDiagnostic } from "@texpulse/shared";

const CATEGORY_RANK: Record<DiagnosticItem["category"], number> = {
  error: 0,
  warning: 1,
  typesetting: 2,
};

function offsetForLine(docText: string, lineNumber: number): { from: number; to: number } {
  const lines = docText.split("\n");
  const idx = Math.max(0, Math.min(lineNumber - 1, lines.length - 1));
  let from = 0;
  for (let i = 0; i < idx; i += 1) {
    from += (lines[i]?.length ?? 0) + 1;
  }
  const to = from + (lines[idx]?.length ?? 0);
  return { from, to };
}

/**
 * Inserts `\usepackage{<packageName>}` into the preamble cleanly if not
 * already loaded. Preserves existing formatting and stops before `\begin{document}`.
 */
export function insertPackageIntoPreamble(
  texContent: string,
  packageName: string,
): string {
  const beginDocIdx = texContent.indexOf("\\begin{document}");
  const preamble = beginDocIdx === -1 ? texContent : texContent.slice(0, beginDocIdx);

  const usepkgRe = /\\usepackage(?:\[[^\]]*\])?\{([^}]*)\}/gu;
  let lastEndIndex = -1;
  for (const match of preamble.matchAll(usepkgRe)) {
    const pkgs = (match[1] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (pkgs.includes(packageName)) {
      return texContent;
    }
    if (match.index !== undefined) {
      lastEndIndex = match.index + match[0].length;
    }
  }

  const insertion = `\\usepackage{${packageName}}`;
  if (lastEndIndex !== -1) {
    const lineEnd = texContent.indexOf("\n", lastEndIndex);
    if (lineEnd !== -1 && (beginDocIdx === -1 || lineEnd < beginDocIdx)) {
      return `${texContent.slice(0, lineEnd + 1)}${insertion}\n${texContent.slice(lineEnd + 1)}`;
    }
    return `${texContent.slice(0, lastEndIndex)}\n${insertion}${texContent.slice(lastEndIndex)}`;
  }

  if (beginDocIdx !== -1) {
    return `${texContent.slice(0, beginDocIdx)}${insertion}\n${texContent.slice(beginDocIdx)}`;
  }

  const docClassMatch = /\\documentclass(?:\[[^\]]*\])?\{[^}]*\}/u.exec(texContent);
  if (docClassMatch && docClassMatch.index !== undefined) {
    const afterClass = docClassMatch.index + docClassMatch[0].length;
    const lineEnd = texContent.indexOf("\n", afterClass);
    const splitAt = lineEnd !== -1 ? lineEnd + 1 : afterClass;
    const prefix = lineEnd !== -1 ? "" : "\n";
    const suffix = lineEnd !== -1 ? "\n" : "";
    return `${texContent.slice(0, splitAt)}${prefix}${insertion}${suffix}${texContent.slice(splitAt)}`;
  }

  return `${insertion}\n${texContent}`;
}

/**
 * Merges live AST diagnostics with settled compiler diagnostics into unified
 * drawer items and `EditorDiagnostic[]` for `IDocumentContextProvider`.
 */
export function buildMergedDiagnosticsView(params: {
  activeFilePath: string;
  activeDocText: string;
  astDiagnostics: readonly EditorDiagnostic[];
  compilerDiagnostics: readonly DiagnosticItem[];
}): {
  drawerItems: DiagnosticItem[];
  contextDiagnostics: EditorDiagnostic[];
} {
  const compilerKeys = new Set(
    params.compilerDiagnostics.map((d) => `${d.file}:${String(d.line)}`),
  );

  const remainingAst = params.astDiagnostics.filter(
    (d) => !compilerKeys.has(`${d.filePath ?? params.activeFilePath}:${String(d.line)}`),
  );

  const astAsItems: DiagnosticItem[] = remainingAst.map((d) => ({
    id: d.id,
    severity: d.severity,
    category: d.severity === "error" ? "error" : "warning",
    source: "ast",
    file: d.filePath ?? params.activeFilePath,
    line: d.line,
    column: d.column,
    message: d.message,
    humanTitle: d.humanTitle ?? d.message,
    explanation: d.explanation ?? d.quickFixHint ?? d.message,
    rawLog: d.rawLog ?? "",
    ruleId: d.ruleId,
    quickFix: d.quickFix,
  }));

  const drawerItems = [...params.compilerDiagnostics, ...astAsItems].sort((a, b) => {
    const catDiff = CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category];
    if (catDiff !== 0) return catDiff;
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return a.line - b.line;
  });

  const compilerAsEditor: EditorDiagnostic[] = params.compilerDiagnostics.map((item) => {
    const span =
      item.file === params.activeFilePath
        ? offsetForLine(params.activeDocText, item.line)
        : { from: 0, to: 0 };
    return {
      id: item.id,
      severity: item.severity,
      category: item.category,
      source: item.source,
      filePath: item.file,
      message: item.message,
      humanTitle: item.humanTitle,
      explanation: item.explanation,
      rawLog: item.rawLog,
      from: span.from,
      to: span.to,
      line: item.line,
      column: item.column ?? 1,
      ruleId: item.ruleId,
      quickFix: item.quickFix,
      quickFixHint: item.quickFix?.description,
    };
  });

  return {
    drawerItems,
    contextDiagnostics: [...compilerAsEditor, ...remainingAst],
  };
}
