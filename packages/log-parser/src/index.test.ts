import { describe, expect, it } from "vitest";
import {
  BibLogParser,
  LatexLogParser,
  parseSettledLogs,
} from "./index.js";

describe("@texpulse/log-parser", () => {
  it("resolves multi-file TeX errors across -file-line-error and file-stack logs", () => {
    const multiFileLog = [
      "This is pdfTeX, Version 3.141592653-2.6-1.40.29 (MiKTeX 26.5)",
      "(./main.tex",
      "(./chapters/methodology.tex",
      "./chapters/methodology.tex:14: Undefined control sequence.",
      "l.14 \\badmacro",
      "              {x}",
      "! Missing $ inserted.",
      "<inserted text>",
      "                $",
      "l.22 E = mc^2",
      ")",
      "LaTeX Warning: Reference `sec:missing' on page 1 undefined on input line 35.",
      "LaTeX Warning: Reference `sec:missing' on page 1 undefined on input line 35.",
      "Overfull \\hbox (14.23pt too wide) in paragraph at lines 40--42",
      "[]\\OT1/cmr/m/n/10 Very long unbreakable line",
      ")",
    ].join("\n");

    const parsed = LatexLogParser.parse(multiFileLog, {
      ignoreDuplicates: true,
      rootFile: "main.tex",
    });

    expect(parsed.errors).toHaveLength(2);
    expect(parsed.errors[0]?.file).toBe("chapters/methodology.tex");
    expect(parsed.errors[0]?.line).toBe(14);
    expect(parsed.errors[0]?.commandToken).toBe("\\badmacro");

    expect(parsed.errors[1]?.file).toBe("chapters/methodology.tex");
    expect(parsed.errors[1]?.line).toBe(22);
    expect(parsed.errors[1]?.message).toContain("Missing $ inserted");

    // Duplicate warning suppressed with ignoreDuplicates: true
    expect(parsed.warnings).toHaveLength(1);
    expect(parsed.warnings[0]?.file).toBe("main.tex");
    expect(parsed.warnings[0]?.line).toBe(35);

    expect(parsed.typesetting).toHaveLength(1);
    expect(parsed.typesetting[0]?.category).toBe("typesetting");
    expect(parsed.typesetting[0]?.file).toBe("main.tex");
    expect(parsed.typesetting[0]?.line).toBe(40);
    expect(parsed.typesetting[0]?.raw).toContain("Overfull \\hbox (14.23pt too wide)");
  });

  it("keeps duplicate warnings when ignoreDuplicates is false", () => {
    const logText = [
      "(./main.tex",
      "LaTeX Warning: Citation `knuth1984' on page 1 undefined on input line 10.",
      "LaTeX Warning: Citation `knuth1984' on page 1 undefined on input line 10.",
      ")",
    ].join("\n");
    const deduped = LatexLogParser.parse(logText, { ignoreDuplicates: true });
    const rawAll = LatexLogParser.parse(logText, { ignoreDuplicates: false });
    expect(deduped.warnings).toHaveLength(1);
    expect(rawAll.warnings).toHaveLength(2);
  });

  it("parses BibTeX .blg errors and warnings with .bib and .tex line mapping", () => {
    const blgText = [
      "The top-level auxiliary file: main.aux",
      "The style file: plain.bst",
      "Database file #1: references.bib",
      'Warning--I didn\'t find a database entry for "missing2026key"',
      "Warning--empty journal in incomplete2025",
      "I was expecting a ',' or a '}'---line 14 of file references.bib",
      " :   title = {Quantum Notes}",
      " :   year  = {2025}",
      "(There was 1 error message)",
    ].join("\n");

    const bibContent = [
      "@article{incomplete2025,",
      "  author = {Ada Lovelace},",
      "  title  = {Notes},",
      "  year   = {1843}",
      "}",
    ].join("\n");

    const texContent = [
      "\\documentclass{article}",
      "\\begin{document}",
      "See \\cite{missing2026key}.",
      "\\end{document}",
    ].join("\n");

    const parsed = BibLogParser.parse(blgText, {
      rootTexFile: "main.tex",
      bibContentByPath: { "references.bib": bibContent },
      texContentByPath: { "main.tex": texContent },
    });

    expect(parsed).toHaveLength(3);
    const missingWarn = parsed.find((e) => e.citationKey === "missing2026key");
    const emptyWarn = parsed.find((e) => e.fieldName === "journal");
    const bibError = parsed.find((e) => e.level === "error");

    expect(bibError?.file).toBe("references.bib");
    expect(bibError?.line).toBe(14);

    expect(missingWarn?.level).toBe("warning");
    expect(missingWarn?.file).toBe("main.tex");
    expect(missingWarn?.line).toBe(3);

    expect(emptyWarn?.level).toBe("warning");
    expect(emptyWarn?.file).toBe("references.bib");
    expect(emptyWarn?.line).toBe(1);

    const unified = parseSettledLogs({
      logText: "",
      blgText,
      bibContentByPath: { "references.bib": bibContent },
      texContentByPath: { "main.tex": texContent },
    });
    expect(unified[0]?.category).toBe("error");
    expect(unified[0]?.humanTitle).toContain("BibTeX syntax issue");
  });

  it("generates HumanReadableLogs explanations and package suggestions for common commands", () => {
    const logText = [
      "(./main.tex",
      "main.tex:12: Undefined control sequence.",
      "l.12 \\toprule",
      "             ",
      "main.tex:18: Undefined control sequence.",
      "l.18 \\includegraphics",
      "                     [width=0.5\\linewidth]{plot.png}",
      "main.tex:21: Undefined control sequence.",
      "l.21 \\mathbb",
      "            {R}",
      "main.tex:25: LaTeX Error: Environment align undefined.",
      "",
      "See the LaTeX manual or LaTeX Companion for explanation.",
      "Type  H <return>  for immediate help.",
      " ...",
      "                                                  ",
      "l.25 \\begin{align}",
      "                  x = y \\end{align}",
      "main.tex:30: Undefined control sequence.",
      "l.30 \\SI",
      "        {10}{\\meter}",
      "main.tex:34: Undefined control sequence.",
      "l.34 \\textcolor",
      "               {red}{alert}",
      "main.tex:40: Extra alignment tab has been changed to \\cr.",
      "l.40 a & b & c \\\\",
      ")",
    ].join("\n");

    const diagnostics = parseSettledLogs({ logText, rootFile: "main.tex" });
    expect(diagnostics).toHaveLength(7);

    const booktabsDiag = diagnostics.find((d) => d.line === 12);
    expect(booktabsDiag?.humanTitle).toBe("Undefined command: \\toprule");
    expect(booktabsDiag?.quickFix).toMatchObject({
      type: "insert-package",
      packageName: "booktabs",
    });

    const graphicxDiag = diagnostics.find((d) => d.line === 18);
    expect(graphicxDiag?.quickFix).toMatchObject({
      type: "insert-package",
      packageName: "graphicx",
    });

    const amssymbDiag = diagnostics.find((d) => d.line === 21);
    expect(amssymbDiag?.quickFix).toMatchObject({
      type: "insert-package",
      packageName: "amssymb",
    });

    const amsmathDiag = diagnostics.find((d) => d.line === 25);
    expect(amsmathDiag?.humanTitle).toContain("Undefined environment: align");
    expect(amsmathDiag?.quickFix).toMatchObject({
      type: "insert-package",
      packageName: "amsmath",
    });

    const siunitxDiag = diagnostics.find((d) => d.line === 30);
    expect(siunitxDiag?.quickFix).toMatchObject({
      type: "insert-package",
      packageName: "siunitx",
    });

    const xcolorDiag = diagnostics.find((d) => d.line === 34);
    expect(xcolorDiag?.quickFix).toMatchObject({
      type: "insert-package",
      packageName: "xcolor",
    });

    const tabDiag = diagnostics.find((d) => d.line === 40);
    expect(tabDiag?.humanTitle).toContain("Too many & columns");
    expect(tabDiag?.quickFix).toBeUndefined();
  });

  it("handles File not found and Missing \\begin{document} rules", () => {
    const logText = [
      "main.tex:2: LaTeX Error: File `nonexistent.sty' not found.",
      "l.2 \\usepackage{nonexistent}",
      "                            ",
      "main.tex:5: LaTeX Error: Missing \\begin{document}.",
      "l.5 Hello world",
    ].join("\n");
    const diagnostics = parseSettledLogs({ logText });
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0]?.humanTitle).toBe("File not found: nonexistent.sty");
    expect(diagnostics[1]?.humanTitle).toContain("Missing \\begin{document}");
  });
});
