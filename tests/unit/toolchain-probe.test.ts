import { describe, expect, it } from "vitest";

import type {
  ProcessInvocation,
  ProcessResult,
  ProcessRunner,
} from "../../src/process/process-runner.js";
import { probeToolchain } from "../../src/toolchain/toolchain-probe.js";

class ProbeRunner implements ProcessRunner {
  constructor(
    private readonly results: ReadonlyMap<string, Partial<ProcessResult>>,
  ) {}

  async run(invocation: ProcessInvocation): Promise<ProcessResult> {
    const configured = this.results.get(invocation.executable) ?? {};
    return {
      executable: invocation.executable,
      args: invocation.args,
      cwd: null,
      exitCode: configured.exitCode ?? 0,
      signal: null,
      stdout: configured.stdout ?? "",
      stderr: configured.stderr ?? "",
      startedAt: "2026-06-13T00:00:00.000Z",
      endedAt: "2026-06-13T00:00:00.001Z",
      durationMs: 1,
      error: configured.error ?? null,
    };
  }
}

describe("probeToolchain", () => {
  it("reports required tools and independent optional tools", async () => {
    const existing = new Set([
      "c:\\tools\\latexmk.exe",
      "c:\\tools\\pdflatex.exe",
      "c:\\tools\\synctex.exe",
    ]);
    const runner = new ProbeRunner(
      new Map([
        [
          "C:\\tools\\latexmk.exe",
          { stdout: "Latexmk, John Collins. Version 4.88" },
        ],
        [
          "C:\\tools\\pdflatex.exe",
          { stdout: "MiKTeX-pdfTeX 4.23 (MiKTeX 25.12)" },
        ],
        [
          "C:\\tools\\synctex.exe",
          {
            exitCode: 1,
            stderr: "Synchronize TeXnology command-line client, version 1.21",
          },
        ],
      ]),
    );

    const result = await probeToolchain({
      pathValue: "C:\\tools",
      platform: "win32",
      processRunner: runner,
      isExecutable: async (path) => existing.has(path.toLowerCase()),
    });

    expect(result.requiredToolsAvailable).toBe(true);
    expect(result.tools.find((tool) => tool.id === "synctex")).toMatchObject({
      state: "available",
      version: "1.21",
    });
    expect(result.tools.find((tool) => tool.id === "xelatex")?.state).toBe(
      "missing",
    );
  });

  it("explains an unusable latexmk caused by missing Perl", async () => {
    const runner = new ProbeRunner(
      new Map([
        [
          "C:\\tools\\latexmk.exe",
          {
            exitCode: 1,
            stderr:
              "MiKTeX could not find the script engine 'perl' which is required to execute 'latexmk'.",
          },
        ],
      ]),
    );

    const result = await probeToolchain({
      pathValue: "C:\\tools",
      platform: "win32",
      processRunner: runner,
      isExecutable: async (path) =>
        path.toLowerCase() === "c:\\tools\\latexmk.exe",
    });

    expect(result.requiredToolsAvailable).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        severity: "error",
        tool: "latexmk",
        message: expect.stringContaining("Perl is missing"),
      }),
    );
  });
});
