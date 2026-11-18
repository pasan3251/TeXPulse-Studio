import { CompletionContext } from "@codemirror/autocomplete";
import { EditorSelection, EditorState } from "@codemirror/state";
import {
  buildIncludeGraphicsSnippet,
  inferProjectFileKind,
  isBinaryAssetPath,
} from "@texpulse/shared";
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
import {
  SIDEBAR_WIDTH_STORAGE_KEY,
  SPLIT_RATIO_STORAGE_KEY,
  clampPdfZoom,
  clampSidebarWidth,
  clampSplitRatio,
  computeFocalScrollPosition,
  computeNextPinchZoomScale,
  computePinchWheelZoomFactor,
  computeSplitRatioFromPointer,
  loadPersistedSidebarWidth,
  loadPersistedSplitRatio,
  savePersistedSidebarWidth,
  savePersistedSplitRatio,
} from "../utils/layout-ergonomics.js";
import {
  applyLineReplacement,
  buildSurroundingSnippet,
  computeSelectionMetrics,
  extractLoadedPackages,
} from "../utils/word-count.js";
import { resolveLatexDefinitionAtOffset } from "./go-to-definition.js";
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

  it("computes selection word metrics, loaded packages, anchored AI snippets, and applies diffs cleanly", () => {
    expect(computeSelectionMetrics("\\textbf{Quantum} error $x^2$").words).toBe(2);
    expect(computeSelectionMetrics("").words).toBe(0);

    const sampleTex = [
      "\\documentclass{article}",
      "\\usepackage{amsmath,booktabs}",
      "\\begin{document}",
      "Line 4",
      "Line 5 \\badmacro",
      "Line 6",
      "\\end{document}",
    ].join("\n");

    expect(extractLoadedPackages(sampleTex)).toEqual(["amsmath", "booktabs"]);
    const snippet = buildSurroundingSnippet(sampleTex, 5, 1);
    expect(snippet).toBe("4: Line 4\n> 5: Line 5 \\badmacro\n6: Line 6");

    const patched = applyLineReplacement(sampleTex, 5, 5, "Line 5 \\textbf{fixed}");
    expect(patched).toContain("Line 4\nLine 5 \\textbf{fixed}\nLine 6");
  });

  it("resolves cross-file Go-To-Definition for \\input, \\ref, \\eqref, and multi-key \\cite", () => {
    const mainFile = DEFAULT_PROJECT_FILES.find((f) => f.path === "main.tex")!;
    const symbolIndex = buildProjectSymbolIndex(DEFAULT_PROJECT_FILES);

    const inputOffset = mainFile.content.indexOf("chapters/methodology") + 4;
    const inputTarget = resolveLatexDefinitionAtOffset({
      docText: mainFile.content,
      offset: inputOffset,
      currentFilePath: "main.tex",
      files: DEFAULT_PROJECT_FILES,
      symbolIndex,
    });
    expect(inputTarget).toEqual({
      kind: "file",
      key: "chapters/methodology",
      filePath: "chapters/methodology.tex",
      line: 1,
      column: 1,
    });

    const refOffset = mainFile.content.indexOf("sec:zne") + 2;
    const refTarget = resolveLatexDefinitionAtOffset({
      docText: mainFile.content,
      offset: refOffset,
      currentFilePath: "main.tex",
      files: DEFAULT_PROJECT_FILES,
      symbolIndex,
    });
    expect(refTarget?.filePath).toBe("chapters/methodology.tex");
    expect(refTarget?.line).toBe(2);

    const eqOffset = mainFile.content.indexOf("eq:lindblad") + 3;
    const eqTarget = resolveLatexDefinitionAtOffset({
      docText: mainFile.content,
      offset: eqOffset,
      currentFilePath: "main.tex",
      files: DEFAULT_PROJECT_FILES,
      symbolIndex,
    });
    expect(eqTarget?.filePath).toBe("main.tex");

    const preskillOffset = mainFile.content.indexOf("preskill2018nisq") + 4;
    const preskillTarget = resolveLatexDefinitionAtOffset({
      docText: mainFile.content,
      offset: preskillOffset,
      currentFilePath: "main.tex",
      files: DEFAULT_PROJECT_FILES,
      symbolIndex,
    });
    expect(preskillTarget).toEqual({
      kind: "citation",
      key: "preskill2018nisq",
      filePath: "references.bib",
      line: 8,
      column: 1,
    });

    const knuthOffset = mainFile.content.indexOf("knuth1984texbook") + 3;
    const knuthTarget = resolveLatexDefinitionAtOffset({
      docText: mainFile.content,
      offset: knuthOffset,
      currentFilePath: "main.tex",
      files: DEFAULT_PROJECT_FILES,
      symbolIndex,
    });
    expect(knuthTarget).toEqual({
      kind: "citation",
      key: "knuth1984texbook",
      filePath: "references.bib",
      line: 1,
      column: 1,
    });
  });

  it("clamps split ratios and sidebar widths, persists ergonomics settings, and computes pinch-zoom focal scroll", () => {
    expect(clampSplitRatio(0.05)).toBe(0.22);
    expect(clampSplitRatio(0.95)).toBe(0.78);
    expect(clampSplitRatio(0.5)).toBe(0.5);
    expect(computeSplitRatioFromPointer(800, 200, 1000)).toBe(0.6);
    expect(computeSplitRatioFromPointer(50, 200, 1000)).toBe(0.22);

    expect(clampSidebarWidth(100)).toBe(180);
    expect(clampSidebarWidth(500)).toBe(380);
    expect(clampSidebarWidth(265.4)).toBe(265);

    const backing = new Map<string, string>();
    const storage = {
      getItem: (key: string) => backing.get(key) ?? null,
      setItem: (key: string, value: string) => {
        backing.set(key, value);
      },
    };
    savePersistedSplitRatio(0.64, storage);
    savePersistedSidebarWidth(290, storage);
    expect(backing.get(SPLIT_RATIO_STORAGE_KEY)).toBe("0.64");
    expect(backing.get(SIDEBAR_WIDTH_STORAGE_KEY)).toBe("290");
    expect(loadPersistedSplitRatio(storage)).toBe(0.64);
    expect(loadPersistedSidebarWidth(storage)).toBe(290);

    expect(clampPdfZoom(0.1)).toBe(0.5);
    expect(clampPdfZoom(5.0)).toBe(3.0);
    expect(computePinchWheelZoomFactor(-50)).toBeCloseTo(Math.exp(0.225), 5);
    const zoomedIn = computeNextPinchZoomScale(1.0, -50);
    expect(Math.round(zoomedIn * 100)).toBe(125);

    const focal = computeFocalScrollPosition({
      scrollLeft: 100,
      scrollTop: 200,
      cursorOffsetX: 250,
      cursorOffsetY: 300,
      previousScale: 1,
      nextScale: 1.5,
    });
    expect(focal.scrollLeft).toBeCloseTo(275, 5);
    expect(focal.scrollTop).toBeCloseTo(450, 5);

    expect(isBinaryAssetPath("figures/diagram.png")).toBe(true);
    expect(isBinaryAssetPath("figures/plot.PDF")).toBe(true);
    expect(isBinaryAssetPath("main.tex")).toBe(false);
    expect(inferProjectFileKind("figures/diagram.svg")).toBe("asset");
    expect(buildIncludeGraphicsSnippet("figures\\diagram.png")).toBe(
      "\\includegraphics[width=0.8\\textwidth]{figures/diagram.png}",
    );
  });
});
