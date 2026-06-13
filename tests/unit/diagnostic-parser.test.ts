import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { parseBuildDiagnostics } from "../../src/diagnostics/diagnostic-parser.js";

async function fixture(name: string): Promise<string> {
  return readFile(`fixtures/${name}/compiler-output.txt`, "utf8");
}

describe("diagnostic parser", () => {
  it("parses an undefined control sequence with a source line", async () => {
    const diagnostics = parseBuildDiagnostics({
      log: await fixture("syntax-error"),
      status: "failed",
      failureReason: "latexmk exited with code 12.",
      rootFile: "main.tex",
      projectFiles: ["main.tex"],
    });

    expect(diagnostics).toEqual([
      expect.objectContaining({
        severity: "error",
        message: "Undefined control sequence.",
        file: "main.tex",
        line: 4,
        column: 1,
        source: "latex",
        rawExcerpt: expect.stringContaining("l.4"),
      }),
    ]);
  });

  it("parses references, citations, and box warnings", async () => {
    const diagnostics = parseBuildDiagnostics({
      log: await fixture("undefined-reference"),
      status: "succeeded",
      failureReason: null,
      rootFile: "main.tex",
      projectFiles: ["main.tex"],
    });

    expect(
      diagnostics.map(({ message, severity, line }) => ({
        message,
        severity,
        line,
      })),
    ).toEqual(
      expect.arrayContaining([
        {
          message: 'Reference "sec:missing" is undefined.',
          severity: "warning",
          line: 3,
        },
        {
          message: 'Citation "missing-source" is undefined.',
          severity: "warning",
          line: 3,
        },
        {
          message:
            "Overfull box detected; inspect the affected paragraph or alignment.",
          severity: "warning",
          line: 3,
        },
        {
          message:
            "Underfull box detected; inspect the affected paragraph or alignment.",
          severity: "warning",
          line: 3,
        },
      ]),
    );
  });

  it("explains missing packages without exposing an unvalidated file path", async () => {
    const diagnostics = parseBuildDiagnostics({
      log: await fixture("missing-package"),
      status: "failed",
      failureReason: "latexmk exited with code 12.",
      rootFile: "main.tex",
      projectFiles: ["main.tex"],
    });

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          message: expect.stringContaining(
            'Install "not-installed" with MiKTeX',
          ),
          file: "main.tex",
          line: 3,
        }),
        expect.objectContaining({
          source: "latexmk",
          file: null,
        }),
      ]),
    );
  });

  it("recognizes BibTeX and Biber failures and warnings", async () => {
    const bibtex = parseBuildDiagnostics({
      log: await fixture("bibliography-bibtex"),
      status: "failed",
      failureReason: "BibTeX failed.",
      rootFile: "main.tex",
      projectFiles: ["main.tex", "references.bib"],
    });
    const biber = parseBuildDiagnostics({
      log: await fixture("bibliography-biber"),
      status: "failed",
      failureReason: "Biber failed.",
      rootFile: "main.tex",
      projectFiles: ["main.tex", "references.bib"],
    });

    expect(bibtex.map((diagnostic) => diagnostic.source)).toEqual([
      "bibtex",
      "bibtex",
    ]);
    expect(bibtex[0]).toMatchObject({
      severity: "error",
      file: null,
    });
    expect(biber.map(({ severity, source }) => ({ severity, source }))).toEqual(
      [
        { severity: "info", source: "biber" },
        { severity: "warning", source: "biber" },
        { severity: "error", source: "biber" },
      ],
    );
  });

  it("links a nested source error to the included project file", async () => {
    const diagnostics = parseBuildDiagnostics({
      log: await fixture("multi-file"),
      status: "failed",
      failureReason: "latexmk exited with code 12.",
      rootFile: "main.tex",
      projectFiles: ["main.tex", "chapters/intro.tex"],
    });

    expect(diagnostics[0]).toMatchObject({
      file: "chapters/intro.tex",
      line: 2,
      message: "Undefined control sequence.",
    });
  });

  it("falls back safely for malformed logs and preserves status events", async () => {
    const malformed = parseBuildDiagnostics({
      log: await fixture("malformed-log"),
      status: "failed",
      failureReason: "Compiler exited unexpectedly.",
      rootFile: "main.tex",
      projectFiles: ["main.tex"],
    });
    const timedOut = parseBuildDiagnostics({
      log: "",
      status: "timed-out",
      failureReason: "Compiler timed out after 120000 ms.",
      rootFile: "main.tex",
      projectFiles: ["main.tex"],
    });
    const cancelled = parseBuildDiagnostics({
      log: "",
      status: "cancelled",
      failureReason: null,
      rootFile: "main.tex",
      projectFiles: ["main.tex"],
    });

    expect(malformed[0]).toMatchObject({
      severity: "error",
      source: "system",
      message: expect.stringContaining("log format was not recognized"),
      rawExcerpt: expect.stringContaining("@@@"),
    });
    expect(timedOut[0]).toMatchObject({
      severity: "error",
      source: "system",
      message: expect.stringContaining("timed out"),
    });
    expect(cancelled[0]).toMatchObject({
      severity: "info",
      source: "system",
      message: expect.stringContaining("cancelled"),
    });
  });

  it("parses file-line-column output and ignores unknown successful output", () => {
    expect(
      parseBuildDiagnostics({
        log: "C:\\project\\chapters\\intro.tex:12:7: warning: Check this line",
        status: "succeeded",
        failureReason: null,
        rootFile: "main.tex",
        projectFiles: ["main.tex", "chapters/intro.tex"],
      }),
    ).toEqual([
      expect.objectContaining({
        severity: "warning",
        file: "chapters/intro.tex",
        line: 12,
        column: 7,
      }),
    ]);
    expect(
      parseBuildDiagnostics({
        log: "unrecognized successful chatter",
        status: "succeeded",
        failureReason: null,
        rootFile: "main.tex",
        projectFiles: ["main.tex"],
      }),
    ).toEqual([]);
  });

  it("reassembles MiKTeX file-line diagnostics wrapped at 79 columns", () => {
    const prefix =
      "C:/Users/test/Documents/TeXPulse/fixtures/syntax-error/main.tex:4: ";
    const paddedPrefix = prefix.padStart(75, "x");
    const diagnostics = parseBuildDiagnostics({
      log: [
        `${paddedPrefix}Unde`,
        "fined control sequence.",
        "l.4 \\undefinedcommand",
        `${paddedPrefix} ==>`,
        " Fatal error occurred, no output PDF file produced!",
      ].join("\n"),
      status: "failed",
      failureReason: "latexmk exited with code 12.",
      rootFile: "main.tex",
      projectFiles: ["main.tex"],
    });

    expect(diagnostics).toEqual([
      expect.objectContaining({
        severity: "error",
        message: "Undefined control sequence.",
        file: "main.tex",
        line: 4,
        rawExcerpt: expect.stringContaining("fined control sequence."),
      }),
    ]);
  });

  it("parses emergency stops, package warnings, and explicit severities", () => {
    const diagnostics = parseBuildDiagnostics({
      log: [
        "(./main.tex",
        "Package hyperref Warning: Rerun to get outlines right on input line 7.",
        "main.tex:8: info: Informational compiler note",
        "main.tex:9: warning: Explicit warning",
        "! Emergency stop.",
        "l.10 \\end{document}",
        ")",
      ].join("\r\n"),
      status: "failed",
      failureReason: "latexmk exited with code 12.",
      rootFile: "main.tex",
      projectFiles: ["main.tex"],
    });

    expect(
      diagnostics.map(({ severity, line, message }) => ({
        severity,
        line,
        message,
      })),
    ).toEqual(
      expect.arrayContaining([
        {
          severity: "warning",
          line: 7,
          message: "hyperref: Rerun to get outlines right",
        },
        {
          severity: "info",
          line: 8,
          message: "Informational compiler note",
        },
        {
          severity: "warning",
          line: 9,
          message: "Explicit warning",
        },
        {
          severity: "error",
          line: 10,
          message:
            "LaTeX stopped before completing the document. Check the preceding error and source syntax.",
        },
      ]),
    );
  });

  it("adds a fatal fallback when a failed build only contains warnings", () => {
    const diagnostics = parseBuildDiagnostics({
      log: "Package rerunfilecheck Warning: File changed.",
      status: "failed",
      failureReason: "latexmk exited with code 12.",
      rootFile: "main.tex",
      projectFiles: ["main.tex"],
    });

    expect(diagnostics).toEqual([
      expect.objectContaining({
        severity: "warning",
        source: "latex",
      }),
      expect.objectContaining({
        severity: "error",
        source: "system",
        message: expect.stringContaining("did not identify the fatal error"),
      }),
    ]);
  });

  it("deduplicates and bounds untrusted compiler output", () => {
    const longMessage = "x".repeat(5_000);
    const lines = [
      `main.tex:1: error: ${longMessage}`,
      `main.tex:1: error: ${longMessage}`,
      ...Array.from(
        { length: 250 },
        (_, index) =>
          `main.tex:${String(index + 2)}: warning: warning ${index}`,
      ),
    ];

    const diagnostics = parseBuildDiagnostics({
      log: lines.join("\n"),
      status: "succeeded",
      failureReason: null,
      rootFile: "./main.tex",
      projectFiles: ["main.tex", "main.tex", "README.md", ""],
    });

    expect(diagnostics).toHaveLength(200);
    expect(diagnostics[0]).toMatchObject({
      file: "main.tex",
      line: 1,
      column: null,
      severity: "error",
    });
    expect(diagnostics[0]?.message).toHaveLength(4_096);
    expect(diagnostics[0]?.message.endsWith("...")).toBe(true);
    expect(diagnostics[0]?.rawExcerpt).toHaveLength(2_048);
    expect(diagnostics[0]?.rawExcerpt.endsWith("...")).toBe(true);
  });

  it("handles empty and superseded output without inventing unsafe locations", () => {
    const failed = parseBuildDiagnostics({
      log: "",
      status: "failed",
      failureReason: null,
      rootFile: "",
      projectFiles: ["notes.txt"],
    });
    const superseded = parseBuildDiagnostics({
      log: "unrecognized output",
      status: "superseded",
      failureReason: null,
      rootFile: "main.tex",
      projectFiles: ["main.tex"],
    });

    expect(failed[0]).toMatchObject({
      file: null,
      line: null,
      rawExcerpt: "No compiler output was available.",
    });
    expect(superseded).toEqual([]);
  });
});
