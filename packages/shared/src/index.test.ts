import { describe, expect, it } from "vitest";
import {
  LATEXMK_BASE_FLAGS,
  buildProjectTree,
  inferProjectFileKind,
  invertPdfJsYToSynctex,
  rankRootCandidates,
} from "./index.js";

describe("@texpulse/shared", () => {
  it("enforces core compiler flags without shell escape", () => {
    expect(LATEXMK_BASE_FLAGS).toEqual([
      "-interaction=nonstopmode",
      "-file-line-error",
      "-synctex=1",
      "-no-shell-escape",
    ]);
  });

  it("builds a sorted directory-first tree from portable paths", () => {
    const tree = buildProjectTree([
      { path: "references.bib", kind: "file" },
      { path: "chapters/methodology.tex", kind: "file" },
      { path: "main.tex", kind: "file" },
    ]);

    expect(tree.map((node) => node.name)).toEqual([
      "chapters",
      "main.tex",
      "references.bib",
    ]);
    expect(tree[0]?.children[0]?.name).toBe("methodology.tex");
  });

  it("ranks the root .tex candidate and infers file kinds", () => {
    const ranked = rankRootCandidates([
      { path: "chapters/intro.tex", content: "\\section{Intro}" },
      {
        path: "main.tex",
        content: "\\documentclass{article}\n\\begin{document}\nHi\n\\end{document}",
      },
    ]);

    expect(ranked[0]?.path).toBe("main.tex");
    expect(inferProjectFileKind("references.bib")).toBe("bib");
  });

  it("inverts PDF.js bottom-left Y coordinates to SyncTeX top-left origin", () => {
    const letterHeightPt = 792;
    expect(invertPdfJsYToSynctex(700, letterHeightPt)).toBe(92);
    expect(invertPdfJsYToSynctex(0, letterHeightPt)).toBe(792);
    expect(invertPdfJsYToSynctex(900, letterHeightPt)).toBe(0);
    expect(invertPdfJsYToSynctex(-10, letterHeightPt)).toBe(792);
    expect(invertPdfJsYToSynctex(Number.NaN, letterHeightPt)).toBe(0);
  });
});
