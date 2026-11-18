import { CompletionContext } from "@codemirror/autocomplete";
import { EditorSelection, EditorState } from "@codemirror/state";
import { latexLanguage } from "codemirror-lang-latex";
import { describe, expect, it } from "vitest";
import { DEFAULT_PROJECT_FILES } from "../data/defaultProject.js";
import { DocumentContextProvider } from "../services/DocumentContext.js";
import { buildProjectSymbolIndex } from "../services/WorkspaceIndexer.js";
import { ensureEnvironmentAutoClose } from "./auto-close-env.js";
import { createTexpulseCompletionSource } from "./completions.js";
import {
  buildMergedDiagnosticsView,
  insertPackageIntoPreamble,
} from "./diagnostics-merge.js";
import { detectActiveMathBlock } from "./math-detector.js";

describe("CodeMirror 6 editor core extensions", () => {
  it("auto-closes \\begin{align} -> \\end{align} and positions cursor inside", () => {
    const startState = EditorState.create({
      doc: "\\begin{align\n",
      selection: EditorSelection.cursor(12),
      extensions: [latexLanguage, ensureEnvironmentAutoClose],
    });

    const tr = startState.update({
      changes: { from: 12, to: 12, insert: "}" },
      selection: EditorSelection.cursor(13),
      userEvent: "input.type",
    });

    expect(tr.state.doc.toString()).toBe("\\begin{align}\n  \n\\end{align}\n");
    expect(tr.state.selection.main.head).toBe("\\begin{align}\n  ".length);
  });

  it("detects active math blocks via Lezer AST for equation, align, and inline math", () => {
    const doc = "\\documentclass{article}\n\\begin{document}\n\\begin{align}\na &= b\n\\end{align}\nInline $x^2 + 1$.\n\\end{document}";
    const alignOffset = doc.indexOf("a &= b");
    const alignState = EditorState.create({
      doc,
      selection: EditorSelection.cursor(alignOffset),
      extensions: [latexLanguage],
    });
    const alignMath = detectActiveMathBlock(alignState);
    expect(alignMath).not.toBeNull();
    expect(alignMath?.delimiter).toBe("align");
    expect(alignMath?.displayMode).toBe(true);
    expect(alignMath?.latex).toContain("\\begin{aligned}");

    const inlineOffset = doc.indexOf("x^2");
    const inlineState = EditorState.create({
      doc,
      selection: EditorSelection.cursor(inlineOffset),
      extensions: [latexLanguage],
    });
    const inlineMath = detectActiveMathBlock(inlineState);
    expect(inlineMath).not.toBeNull();
    expect(inlineMath?.displayMode).toBe(false);
    expect(inlineMath?.latex).toBe("x^2 + 1");
  });

  it("completes project \\cite{} BibTeX keys and cross-file \\ref{} labels", () => {
    const symbolIndex = buildProjectSymbolIndex(DEFAULT_PROJECT_FILES);
    const complete = createTexpulseCompletionSource(() => symbolIndex);

    const citeDoc = "As proved in \\cite{";
    const citeState = EditorState.create({ doc: citeDoc, extensions: [latexLanguage] });
    const citeRes = complete(new CompletionContext(citeState, citeDoc.length, false));
    expect(citeRes?.options.some((o) => o.label === "preskill2018nisq")).toBe(true);

    const refDoc = "See Equation~\\eqref{";
    const refState = EditorState.create({ doc: refDoc, extensions: [latexLanguage] });
    const refRes = complete(new CompletionContext(refState, refDoc.length, false));
    expect(refRes?.options.some((o) => o.label === "eq:richardson")).toBe(true);
  });

  it("exposes AST, cursor scope, symbols, and diagnostics through IDocumentContextProvider", () => {
    const doc = "\\section{Quantum}\n\\begin{align}\ny &= mx\n\\end{align}\n";
    const offset = doc.indexOf("y &= mx");
    const tree = latexLanguage.parser.parse(doc);
    const provider = new DocumentContextProvider({
      filePath: "main.tex",
      docText: doc,
      cursorOffset: offset,
      selectedText: "",
      syntaxTree: tree,
      projectSymbols: buildProjectSymbolIndex(DEFAULT_PROJECT_FILES),
      diagnostics: [],
      activeMathBlock: {
        latex: "\\begin{aligned}\ny &= mx\n\\end{aligned}",
        displayMode: true,
        delimiter: "align",
        from: doc.indexOf("\\begin{align}"),
        to: doc.length - 1,
        line: 2,
      },
    });

    expect(provider.getCursorScope().currentSection).toBe("Quantum");
    expect(provider.getCursorScope().activeEnvironment).toBe("align");
    expect(provider.getSyntaxTree().nodeCount).toBeGreaterThan(0);
    expect(provider.getProjectSymbols().citations.length).toBe(6);
  });

  it("inserts missing packages into the LaTeX preamble idempotently and merges diagnostics", () => {
    const tex = [
      "\\documentclass{article}",
      "\\usepackage{amsmath,amssymb}",
      "\\begin{document}",
      "\\toprule",
      "\\end{document}",
    ].join("\n");

    const updated = insertPackageIntoPreamble(tex, "booktabs");
    expect(updated).toContain("\\usepackage{amsmath,amssymb}\n\\usepackage{booktabs}\n\\begin{document}");
    // Idempotent when package already present
    expect(insertPackageIntoPreamble(updated, "booktabs")).toBe(updated);
    expect(insertPackageIntoPreamble(updated, "amsmath")).toBe(updated);

    const merged = buildMergedDiagnosticsView({
      activeFilePath: "main.tex",
      activeDocText: tex,
      astDiagnostics: [
        {
          id: "ast-4",
          severity: "warning",
          message: "Missing package booktabs",
          from: 50,
          to: 58,
          line: 4,
          column: 1,
          ruleId: "latex-ast-lint",
        },
        {
          id: "ast-3",
          severity: "warning",
          message: "Other AST note",
          from: 30,
          to: 35,
          line: 3,
          column: 1,
          ruleId: "latex-ast-lint",
        },
      ],
      compilerDiagnostics: [
        {
          id: "latex-log:undefined-control-sequence:main.tex:4:0",
          severity: "error",
          category: "error",
          source: "latex-log",
          file: "main.tex",
          line: 4,
          message: "Undefined control sequence.",
          humanTitle: "Undefined command: \\toprule",
          explanation: "Add booktabs",
          rawLog: "main.tex:4: Undefined control sequence.",
          ruleId: "undefined-control-sequence",
          quickFix: { type: "insert-package", packageName: "booktabs", command: "\\toprule" },
        },
      ],
    });

    // AST warning on line 4 is coalesced in favor of the rich compiler error
    expect(merged.drawerItems).toHaveLength(2);
    expect(merged.drawerItems[0]?.source).toBe("latex-log");
    expect(merged.contextDiagnostics).toHaveLength(2);
  });
});
