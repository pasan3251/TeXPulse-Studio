import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  PreambleCacheService,
  buildCachedCompileArgs,
  buildFormatDumpArgs,
  computePreambleHash,
  extractPreambleDependencies,
  splitLatexPreamble,
} from "./preamble-cache.js";
import { buildLatexmkArguments, CompilerRunner } from "./compiler-runner.js";
import { NodeProcessRunner, type ProcessRunner } from "./process-runner.js";
import { parseForwardSyncOutput, parseInverseSyncOutput } from "../synctex/synctex-parser.js";

describe("Tier 2 mylatexformat PreambleCacheService & compiler pipeline", () => {
  it("splits preamble at \\endofdump or \\begin{document} and hashes dependencies", async () => {
    const tex = "\\documentclass{article}\n\\input{preamble/macros}\n\\begin{document}\nBody text.\n\\end{document}\n";
    const split = splitLatexPreamble(tex);
    expect(split.splitMacro).toBe("\\begin{document}");
    expect(split.preamble).toContain("\\documentclass{article}");
    expect(extractPreambleDependencies(split.preamble)).toEqual([
      "article.cls",
      "preamble/macros.tex",
    ]);

    const explicitSplit = splitLatexPreamble("\\documentclass{article}\n\\endofdump\n\\begin{document}\nHi\n\\end{document}");
    expect(explicitSplit.splitMacro).toBe("\\endofdump");

    const dir = await mkdtemp(join(tmpdir(), "texpulse-hash-"));
    try {
      await mkdir(join(dir, "preamble"), { recursive: true });
      await writeFile(join(dir, "preamble/macros.tex"), "\\newcommand{\\R}{\\mathbb{R}}\n");
      const hashA = await computePreambleHash(dir, tex);
      // Editing body text keeps preamble hash identical
      const hashBodyEdit = await computePreambleHash(
        dir,
        tex.replace("Body text.", "Updated body text!"),
      );
      expect(hashBodyEdit).toBe(hashA);

      // Editing included preamble file invalidates preamble hash
      await writeFile(join(dir, "preamble/macros.tex"), "\\newcommand{\\R}{\\mathbf{R}}\n");
      const hashPreambleDepEdit = await computePreambleHash(dir, tex);
      expect(hashPreambleDepEdit).not.toBe(hashA);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("constructs required non-shell-escape pdflatex -ini, --fmt, and latexmk flags", () => {
    expect(buildFormatDumpArgs("main.tex")).toEqual([
      "-ini",
      "-interaction=nonstopmode",
      "-file-line-error",
      "-no-shell-escape",
      "-output-directory=.texpulse-cache",
      "-jobname=preamble_cache",
      "&pdflatex",
      "mylatexformat.ltx",
      "main.tex",
    ]);

    expect(buildCachedCompileArgs("main.tex")).toEqual([
      "--fmt=.texpulse-cache/preamble_cache",
      "-synctex=1",
      "-interaction=nonstopmode",
      "-file-line-error",
      "-no-shell-escape",
      "-aux-directory=.texpulse-cache",
      "-output-directory=.texpulse-cache",
      "main.tex",
    ]);

    expect(buildLatexmkArguments("pdflatex", "main.tex")).toEqual([
      "-norc",
      "-pdf",
      "-interaction=nonstopmode",
      "-file-line-error",
      "-synctex=1",
      "-no-shell-escape",
      "-outdir=.texpulse-cache",
      "main.tex",
    ]);
  });

  it("hits format cache when preamble hash matches and rebuilds when invalidated", async () => {
    const dir = await mkdtemp(join(tmpdir(), "texpulse-fmt-service-"));
    try {
      const cacheDir = join(dir, ".texpulse-cache");
      const runMock = vi.fn<ProcessRunner["run"]>(async (inv) => {
        await mkdir(cacheDir, { recursive: true });
        await writeFile(join(cacheDir, "preamble_cache.fmt"), "binary-fmt");
        return {
          executable: inv.executable,
          args: inv.args,
          cwd: inv.cwd ?? null,
          exitCode: 0,
          signal: null,
          stdout: "",
          stderr: "",
          outputTruncated: false,
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
          durationMs: 12,
          error: null,
          terminationReason: null,
          terminationError: null,
        };
      });

      const runner: ProcessRunner = { run: runMock };
      const service = new PreambleCacheService("pdflatex");
      const texV1 = "\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nFirst\n\\end{document}";

      const first = await service.ensureFormatCache(dir, "main.tex", texV1, runner);
      expect(first.ready).toBe(true);
      expect(first.cacheHit).toBe(false);
      expect(runMock).toHaveBeenCalledTimes(1);

      const second = await service.ensureFormatCache(
        dir,
        "main.tex",
        texV1.replace("First", "Second"),
        runner,
      );
      expect(second.ready).toBe(true);
      expect(second.cacheHit).toBe(true);
      expect(runMock).toHaveBeenCalledTimes(1);

      const third = await service.ensureFormatCache(
        dir,
        "main.tex",
        texV1.replace("\\usepackage{amsmath}", "\\usepackage{amsmath,amssymb}"),
        runner,
      );
      expect(third.ready).toBe(true);
      expect(third.cacheHit).toBe(false);
      expect(runMock).toHaveBeenCalledTimes(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("parses SyncTeX forward and inverse outputs across multi-file paths", () => {
    const forwardRaw = "SyncTeX result begin\nPage:2\nx:120.5\ny:240.25\nW:310\nH:12\nSyncTeX result end\n";
    expect(parseForwardSyncOutput(forwardRaw)).toEqual({
      page: 2,
      x: 120.5,
      y: 240.25,
      width: 310,
      height: 12,
    });

    const inverseRaw = "SyncTeX result begin\nInput:C:\\workspace\\chapters\\methodology.tex\nLine:14\nColumn:3\nSyncTeX result end\n";
    expect(parseInverseSyncOutput(inverseRaw, ["main.tex", "chapters/methodology.tex"])).toEqual({
      path: "chapters/methodology.tex",
      line: 14,
      column: 3,
    });
  });

  it("aborts an active process tree cleanly via AbortSignal", async () => {
    const runner = new NodeProcessRunner();
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 80);

    const res = await runner.run({
      executable: process.execPath,
      args: ["-e", "setInterval(() => {}, 1000)"],
      signal: ac.signal,
    });
    expect(res.terminationReason).toBe("cancelled");
  });

  it("parses settled disk .log/.blg diagnostics (ignoring stdout) and skips Tier 3 fallback on normal Tier 2 TeX errors", async () => {
    const dir = await mkdtemp(join(tmpdir(), "texpulse-disk-logs-"));
    try {
      await mkdir(join(dir, ".texpulse-cache"), { recursive: true });
      await writeFile(
        join(dir, "main.tex"),
        "\\documentclass{article}\n\\begin{document}\n\\toprule\n\\end{document}\n",
      );

      let invocations = 0;
      const runMock = vi.fn<ProcessRunner["run"]>(async (inv) => {
        invocations += 1;
        const cacheDir = join(dir, ".texpulse-cache");
        if (inv.args.includes("-ini")) {
          await writeFile(join(cacheDir, "preamble_cache.fmt"), "fmt");
          return {
            executable: inv.executable,
            args: inv.args,
            cwd: inv.cwd ?? null,
            exitCode: 0,
            signal: null,
            stdout: "",
            stderr: "",
            outputTruncated: false,
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
            durationMs: 5,
            error: null,
            terminationReason: null,
            terminationError: null,
          };
        }

        // Write settled .log and .blg to disk, and emit bogus stdout error that must be ignored
        await writeFile(
          join(cacheDir, "main.log"),
          "./chapters/methodology.tex:8: Undefined control sequence.\nl.8 \\toprule\n",
        );
        await writeFile(
          join(cacheDir, "main.blg"),
          'Warning--I didn\'t find a database entry for "ghost2026"\n',
        );
        return {
          executable: inv.executable,
          args: inv.args,
          cwd: inv.cwd ?? null,
          exitCode: 1,
          signal: null,
          stdout: "main.tex:99: Fake stdout error should never be parsed.",
          stderr: "",
          outputTruncated: false,
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
          durationMs: 10,
          error: null,
          terminationReason: null,
          terminationError: null,
        };
      });

      const runner = new CompilerRunner(dir, { processRunner: { run: runMock } });
      const result = await runner.compile({ rootFile: "main.tex", engine: "pdflatex" });

      // Ran -ini + Tier 2 pdflatex --fmt once; did NOT run Tier 3 latexmk fallback
      expect(invocations).toBe(2);
      expect(result.tier).toBe("tier2-fmt");
      expect(result.status).toBe("failed");
      expect(result.diagnostics.some((d) => d.line === 99)).toBe(false);

      const cmdError = result.diagnostics.find((d) => d.category === "error");
      expect(cmdError?.file).toBe("chapters/methodology.tex");
      expect(cmdError?.line).toBe(8);
      expect(cmdError?.quickFix).toMatchObject({
        type: "insert-package",
        packageName: "booktabs",
      });

      const bibWarn = result.diagnostics.find((d) => d.source === "bib-log");
      expect(bibWarn?.category).toBe("warning");
      expect(bibWarn?.humanTitle).toContain("ghost2026");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("invalidates and regenerates .fmt via pdflatex -ini when quick-fix mutates preamble", async () => {
    const dir = await mkdtemp(join(tmpdir(), "texpulse-preamble-regen-"));
    try {
      const cacheDir = join(dir, ".texpulse-cache");
      await mkdir(cacheDir, { recursive: true });
      const texInitial = [
        "\\documentclass{article}",
        "\\usepackage{amsmath}",
        "\\begin{document}",
        "Body v1",
        "\\end{document}",
      ].join("\n");
      await writeFile(join(dir, "main.tex"), texInitial, "utf8");

      const calls: Array<{ args: readonly string[] }> = [];
      const runMock = vi.fn<ProcessRunner["run"]>(async (inv) => {
        calls.push({ args: [...inv.args] });
        if (inv.args.includes("-ini")) {
          await writeFile(join(cacheDir, "preamble_cache.fmt"), `fmt-${String(calls.length)}`);
        } else {
          await writeFile(join(cacheDir, "main.pdf"), "%PDF-1.4\n");
          await writeFile(join(cacheDir, "main.log"), "(./main.tex\n)");
        }
        return {
          executable: inv.executable,
          args: inv.args,
          cwd: inv.cwd ?? null,
          exitCode: 0,
          signal: null,
          stdout: "",
          stderr: "",
          outputTruncated: false,
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
          durationMs: 8,
          error: null,
          terminationReason: null,
          terminationError: null,
        };
      });

      const runner = new CompilerRunner(dir, { processRunner: { run: runMock } });

      // 1. Cold build dumps .fmt then runs Tier 2 --fmt
      const first = await runner.compile({ rootFile: "main.tex", engine: "pdflatex" });
      expect(first.status).toBe("succeeded");
      expect(first.tier).toBe("tier2-fmt");
      expect(first.preambleCacheHit).toBe(false);
      expect(calls.filter((c) => c.args.includes("-ini"))).toHaveLength(1);

      // 2. Body-only edit hits existing .fmt without running pdflatex -ini
      await writeFile(join(dir, "main.tex"), texInitial.replace("Body v1", "Body v2"), "utf8");
      const second = await runner.compile({ rootFile: "main.tex", engine: "pdflatex" });
      expect(second.preambleCacheHit).toBe(true);
      expect(second.preambleHash).toBe(first.preambleHash);
      expect(calls.filter((c) => c.args.includes("-ini"))).toHaveLength(1);

      // 3. Preamble quick-fix insertion (\usepackage{booktabs}) invalidates .fmt & runs -ini first
      const texQuickFixed = [
        "\\documentclass{article}",
        "\\usepackage{amsmath}",
        "\\usepackage{booktabs}",
        "\\begin{document}",
        "Body v2",
        "\\end{document}",
      ].join("\n");
      await writeFile(join(dir, "main.tex"), texQuickFixed, "utf8");
      const third = await runner.compile({ rootFile: "main.tex", engine: "pdflatex" });
      expect(third.status).toBe("succeeded");
      expect(third.tier).toBe("tier2-fmt");
      expect(third.preambleCacheHit).toBe(false);
      expect(third.preambleHash).not.toBe(first.preambleHash);
      expect(calls.filter((c) => c.args.includes("-ini"))).toHaveLength(2);
      // Verify -ini ran right before the --fmt body compile
      expect(calls[calls.length - 2]?.args).toContain("-ini");
      expect(calls[calls.length - 1]?.args.some((a) => a.startsWith("--fmt="))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
