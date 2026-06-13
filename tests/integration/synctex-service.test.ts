import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ProcessResult,
  ProcessRunner,
} from "../../src/process/process-runner.js";
import {
  SynctexService,
  SynctexServiceError,
} from "../../src/synctex/synctex-service.js";

const temporaryDirectories: string[] = [];
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const fakeSynctex = join(currentDirectory, "fixtures", "fake-synctex.mjs");

afterEach(async () => {
  delete process.env.SYNCTEX_EDITOR;
  delete process.env.SYNCTEX_VIEWER;
  delete process.env.TEXPULSE_FAKE_SYNCTEX_TRACE;
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("SynctexService", () => {
  it("navigates both directions with argument arrays in a path with spaces", async () => {
    const project = await mkdtemp(join(tmpdir(), "texpulse synctex "));
    temporaryDirectories.push(project);
    const buildDirectory = join(project, ".texpulse", "build", "generation 1");
    const tracePath = join(project, "synctex-trace.jsonl");
    await writeFile(join(project, "main.tex"), "main");
    const service = new SynctexService({
      command: { executable: process.execPath, prefixArgs: [fakeSynctex] },
    });
    process.env.SYNCTEX_EDITOR = "unsafe-editor";
    process.env.SYNCTEX_VIEWER = "unsafe-viewer";
    process.env.TEXPULSE_FAKE_SYNCTEX_TRACE = tracePath;

    await expect(
      service.forward({
        projectDirectory: project,
        sourcePath: join(project, "main.tex"),
        line: 3,
        column: 4,
        pdfPath: join(buildDirectory, "main.pdf"),
        buildDirectory,
      }),
    ).resolves.toEqual({
      page: 1,
      x: 72,
      y: 108,
      width: 180,
      height: 16,
    });
    await expect(
      service.inverse({
        projectDirectory: project,
        page: 1,
        x: 72,
        y: 108,
        pdfPath: join(buildDirectory, "main.pdf"),
        buildDirectory,
        projectFiles: ["main.tex"],
      }),
    ).resolves.toEqual({ path: "main.tex", line: 3, column: null });

    const traces = (await readFile(tracePath, "utf8"))
      .trim()
      .split(/\r?\n/u)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(traces).toHaveLength(2);
    expect(traces[0]).toMatchObject({
      cwd: project,
      editor: null,
      viewer: null,
      args: [
        "view",
        "-i",
        `3:4:${join(project, "main.tex")}`,
        "-o",
        join(buildDirectory, "main.pdf"),
        "-d",
        buildDirectory,
      ],
    });
  });

  it("reports process and parser failures without exposing command output", async () => {
    const failing = new SynctexService({
      command: { executable: "missing-synctex-for-test" },
    });

    await expect(
      failing.forward({
        projectDirectory: process.cwd(),
        sourcePath: "main.tex",
        line: 1,
        column: 1,
        pdfPath: "main.pdf",
        buildDirectory: ".",
      }),
    ).rejects.toEqual(
      new SynctexServiceError(
        "synctex-failed",
        "SyncTeX could not resolve the requested location.",
      ),
    );
  });

  it("reports missing forward and inverse records as unavailable", async () => {
    const processRunner: ProcessRunner = {
      run: vi.fn(() => Promise.resolve(processResult({ stdout: "no result" }))),
    };
    const service = new SynctexService({
      command: { executable: "synctex" },
      processRunner,
    });

    await expect(
      service.forward({
        projectDirectory: process.cwd(),
        sourcePath: "main.tex",
        line: 1,
        column: 1,
        pdfPath: "main.pdf",
        buildDirectory: ".",
      }),
    ).rejects.toMatchObject({ code: "synctex-unavailable" });
    await expect(
      service.inverse({
        projectDirectory: process.cwd(),
        page: 1,
        x: 1,
        y: 1,
        pdfPath: "main.pdf",
        buildDirectory: ".",
        projectFiles: ["main.tex"],
      }),
    ).rejects.toMatchObject({ code: "synctex-unavailable" });
    expect(processRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({ executable: "synctex" }),
    );
  });

  it("maps timeout and nonzero exits to generic failures", async () => {
    const timedOut = new SynctexService({
      command: { executable: "synctex" },
      processRunner: {
        run: () =>
          Promise.resolve(
            processResult({ terminationReason: "timed-out", exitCode: null }),
          ),
      },
    });
    await expect(
      timedOut.forward({
        projectDirectory: process.cwd(),
        sourcePath: "main.tex",
        line: 1,
        column: 1,
        pdfPath: "main.pdf",
        buildDirectory: ".",
      }),
    ).rejects.toEqual(
      new SynctexServiceError(
        "synctex-failed",
        "SyncTeX navigation timed out.",
      ),
    );

    const nonzero = new SynctexService({
      command: { executable: "synctex" },
      processRunner: {
        run: () => Promise.resolve(processResult({ exitCode: 2 })),
      },
    });
    await expect(
      nonzero.forward({
        projectDirectory: process.cwd(),
        sourcePath: "main.tex",
        line: 1,
        column: 1,
        pdfPath: "main.pdf",
        buildDirectory: ".",
      }),
    ).rejects.toMatchObject({ code: "synctex-failed" });
  });
});

function processResult(overrides: Partial<ProcessResult> = {}): ProcessResult {
  return {
    executable: "synctex",
    args: [],
    cwd: null,
    exitCode: 0,
    signal: null,
    stdout: "",
    stderr: "",
    startedAt: "2026-06-14T00:00:00.000Z",
    endedAt: "2026-06-14T00:00:00.001Z",
    durationMs: 1,
    error: null,
    terminationReason: null,
    terminationError: null,
    ...overrides,
  };
}
