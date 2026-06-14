import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { MiktexCompilerAdapter } from "../../src/compiler/compiler-adapter.js";
import type { CompilerAdapter } from "../../src/compiler/compiler-adapter.js";
import type {
  CompileRequest,
  CompileResult,
} from "../../src/compiler/compile-types.js";
import { ProjectSession } from "../../src/electron/project-session.js";
import { defaultGlobalSettings } from "../../src/settings/settings-types.js";
import { SynctexService } from "../../src/synctex/synctex-service.js";

const temporaryDirectories: string[] = [];
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const fakeLatexmk = join(currentDirectory, "fixtures", "fake-latexmk.mjs");
const fakeSynctex = join(currentDirectory, "fixtures", "fake-synctex.mjs");

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createProject(): Promise<string> {
  const project = await mkdtemp(join(tmpdir(), "texpulse-session-"));
  temporaryDirectories.push(project);
  await writeFile(
    join(project, "main.tex"),
    "\\documentclass{article}\n\\begin{document}\nSuccess\n\\end{document}\n",
  );
  return project;
}

function adapter(...prefixArgs: string[]) {
  return new MiktexCompilerAdapter({
    latexmkCommand: {
      executable: process.execPath,
      prefixArgs: [fakeLatexmk, ...prefixArgs],
    },
    engineExecutable: process.execPath,
  });
}

class RecordingAdapter implements CompilerAdapter {
  request: CompileRequest | null = null;

  probe(): Promise<never> {
    throw new Error("Probe is not used by ProjectSession.");
  }

  compile(request: CompileRequest): Promise<CompileResult> {
    this.request = request;
    const completedAt = new Date().toISOString();
    return Promise.resolve({
      buildId: request.buildId!,
      generation: request.generation!,
      status: "failed",
      exitCode: 2,
      startedAt: completedAt,
      endedAt: completedAt,
      durationMs: 0,
      executable: "recording-adapter",
      args: [],
      projectDirectory: request.projectDirectory,
      rootFile: request.rootFile,
      buildDirectory: request.buildDirectory ?? null,
      pdfPath: null,
      logPath: null,
      synctexPath: null,
      stdout: "",
      stderr: "",
      failureReason: "Recorded without launching a compiler.",
    });
  }

  cancel(): Promise<boolean> {
    return Promise.resolve(false);
  }
}

describe("ProjectSession", () => {
  it("describes an opaque project identity and closes an active watcher", async () => {
    const project = await createProject();
    const changes = vi.fn();
    const session = await ProjectSession.open(project, adapter(), changes);
    const snapshot = await session.readTextFile("main.tex");

    expect(session.describe()).toMatchObject({
      projectId: expect.stringMatching(/^[a-f0-9]{16}$/u),
      autoBuild: true,
      settings: {
        recipe: "latexmk-pdf",
        allowLatexmkRc: false,
      },
    });
    await session.writeTextFile(
      "main.tex",
      `${snapshot.content}\nUpdated`,
      snapshot.version,
    );
    await session.dispose();
  });

  it("loads only a completed PDF and retains it when the next build fails", async () => {
    const project = await createProject();
    const session = await ProjectSession.open(project, adapter());

    const successful = await session.compile("main.tex");
    expect(successful).toMatchObject({
      status: "succeeded",
      visiblePdf: { generation: 1, isCurrent: true, fileName: "main.pdf" },
    });
    expect(successful.visiblePdf).not.toBeNull();
    if (successful.visiblePdf === null) {
      return;
    }
    const loaded = await session.loadPdf(successful.visiblePdf);
    expect(new TextDecoder().decode(loaded.data)).toContain("%PDF-1.4");

    await writeFile(
      join(project, "main.tex"),
      "\\documentclass{article}\n% TEXPULSE_FAKE_FAIL\n",
    );
    const failed = await session.compile("main.tex");

    expect(failed).toMatchObject({
      status: "failed",
      failureReason: "latexmk exited with code 3.",
      visiblePdf: {
        buildId: successful.visiblePdf.buildId,
        generation: 1,
        isCurrent: false,
      },
    });
    await expect(session.loadPdf(successful.visiblePdf)).resolves.toMatchObject(
      {
        artifact: { generation: 1, isCurrent: false },
      },
    );
  });

  it("reports a successful compiler exit with no PDF as a failed build", async () => {
    const project = await createProject();
    const session = await ProjectSession.open(
      project,
      adapter("--fake-no-pdf"),
    );

    await expect(session.compile("main.tex")).resolves.toMatchObject({
      status: "failed",
      visiblePdf: null,
      failureReason:
        "latexmk exited successfully but did not produce a readable PDF.",
    });
  });

  it("reports missing SyncTeX data as a non-fatal navigation error", async () => {
    const project = await createProject();
    const session = await ProjectSession.open(
      project,
      adapter("--fake-no-synctex"),
    );
    const build = await session.compile("main.tex");
    expect(build.visiblePdf).not.toBeNull();
    if (build.visiblePdf === null) {
      return;
    }

    await expect(
      session.forwardSync({
        buildId: build.visiblePdf.buildId,
        generation: build.visiblePdf.generation,
        path: "main.tex",
        line: 1,
        column: 1,
      }),
    ).rejects.toMatchObject({
      code: "synctex-unavailable",
      message: expect.stringContaining("did not produce SyncTeX data"),
    });
  });

  it("returns a project-relative diagnostic for an included source file", async () => {
    const project = await createProject();
    await mkdir(join(project, "chapters"));
    await writeFile(
      join(project, "main.tex"),
      "\\documentclass{article}\n\\begin{document}\n\\input{chapters/intro}\n\\end{document}\n",
    );
    await writeFile(
      join(project, "chapters", "intro.tex"),
      "Included line\n\\undefinedcommand % TEXPULSE_DIAG_UNDEFINED\n",
    );
    const session = await ProjectSession.open(project, adapter());

    const failed = await session.compile("main.tex");

    expect(failed).toMatchObject({
      status: "failed",
      diagnostics: [
        {
          severity: "error",
          message: "Undefined control sequence.",
          file: "chapters/intro.tex",
          line: 2,
          source: "latex",
        },
      ],
      log: expect.stringContaining("Undefined control sequence"),
    });
    expect(JSON.stringify(failed.diagnostics)).not.toContain(project);
  });

  it("maps current multi-file source and PDF positions without exposing absolute paths", async () => {
    const project = await createProject();
    await mkdir(join(project, "chapters"));
    await writeFile(
      join(project, "main.tex"),
      "\\documentclass{article}\n\\begin{document}\n\\input{chapters/intro}\n\\end{document}\n",
    );
    await writeFile(
      join(project, "chapters", "intro.tex"),
      "Included heading\nIncluded target\n",
    );
    const session = await ProjectSession.open(
      project,
      adapter(),
      undefined,
      new SynctexService({
        command: { executable: process.execPath, prefixArgs: [fakeSynctex] },
      }),
    );
    const build = await session.compile("main.tex");
    expect(build.visiblePdf).not.toBeNull();
    if (build.visiblePdf === null) {
      return;
    }

    const forward = await session.forwardSync({
      buildId: build.visiblePdf.buildId,
      generation: build.visiblePdf.generation,
      path: "chapters/intro.tex",
      line: 2,
      column: 1,
    });
    const inverse = await session.inverseSync({
      buildId: build.visiblePdf.buildId,
      generation: build.visiblePdf.generation,
      page: forward.page,
      x: forward.x,
      y: forward.y,
    });

    expect(forward).toEqual({
      page: 1,
      x: 72,
      y: 108,
      width: 180,
      height: 16,
    });
    expect(inverse).toEqual({
      path: "chapters/intro.tex",
      line: 2,
      column: null,
    });
    expect(JSON.stringify(inverse)).not.toContain(project);

    await writeFile(
      join(project, "main.tex"),
      "\\documentclass{article}\n% TEXPULSE_FAKE_FAIL\n",
    );
    await session.compile("main.tex");
    await expect(
      session.forwardSync({
        buildId: build.visiblePdf.buildId,
        generation: build.visiblePdf.generation,
        path: "chapters/intro.tex",
        line: 2,
        column: 1,
      }),
    ).rejects.toMatchObject({ code: "synctex-stale" });
  });

  it("rejects invalid and stale artifact requests before filesystem access", async () => {
    const project = await createProject();
    const session = await ProjectSession.open(project, adapter());

    await expect(session.compile("references.bib")).rejects.toMatchObject({
      code: "no-root",
    });
    await expect(
      session.resolvePdf({ buildId: "unknown", generation: 1 }),
    ).rejects.toMatchObject({
      code: "artifact-stale",
    });
    await expect(session.cancelBuild()).resolves.toBe(false);
  });

  it.each([
    ["latexmk-xelatex", "xelatex"],
    ["latexmk-lualatex", "lualatex"],
  ] as const)(
    "maps project recipe %s to compiler recipe %s",
    async (stored, expected) => {
      const project = await createProject();
      await mkdir(join(project, ".texpulse"), { recursive: true });
      await writeFile(
        join(project, ".texpulse", "project.json"),
        `${JSON.stringify({
          schemaVersion: 1,
          rootFile: "main.tex",
          recipe: stored,
          buildDirectory: ".texpulse/build",
          autoBuild: false,
        })}\n`,
      );
      const recordingAdapter = new RecordingAdapter();
      const session = await ProjectSession.open(project, recordingAdapter);

      await session.compile("main.tex");

      expect(recordingAdapter.request?.recipe).toBe(expected);
    },
  );

  it("applies saved project and global settings to a clean build", async () => {
    const project = await createProject();
    const recordingAdapter = new RecordingAdapter();
    const session = await ProjectSession.open(
      project,
      recordingAdapter,
      undefined,
      undefined,
      () =>
        Promise.resolve({
          schemaVersion: 1,
          theme: "system",
          autosave: true,
          autoBuild: true,
          debounceMs: 800,
          compileTimeoutMs: 180_000,
          customBinDirectory: "C:\\custom tools",
          editorFontSize: 16,
          pdfZoomMode: "fit-page",
          setupCompleted: true,
        }),
    );

    await session.updateProjectSettings({
      rootFile: "main.tex",
      recipe: "latexmk-xelatex",
      buildDirectory: ".texpulse/output",
      autoBuild: false,
      allowLatexmkRc: true,
    });
    await session.cleanBuild("main.tex");

    expect(recordingAdapter.request).toMatchObject({
      recipe: "xelatex",
      customBinDirectory: "C:\\custom tools",
      timeoutMs: 180_000,
      allowLatexmkRc: true,
      clean: true,
    });
    await expect(
      readFile(join(project, ".texpulse", "project.json"), "utf8"),
    ).resolves.toContain('"schemaVersion": 2');
  });

  it("uses the global auto-build default only when project settings are absent", async () => {
    const project = await createProject();
    const session = await ProjectSession.open(
      project,
      adapter(),
      undefined,
      undefined,
      () =>
        Promise.resolve({
          ...defaultGlobalSettings(),
          autoBuild: false,
        }),
    );

    expect(session.describe().settings.autoBuild).toBe(false);
  });

  it("rejects a build while project settings are being validated and saved", async () => {
    const project = await createProject();
    const session = await ProjectSession.open(project, adapter());
    const update = session.updateProjectSettings({
      rootFile: "main.tex",
      recipe: "latexmk-xelatex",
      buildDirectory: ".texpulse/output",
      autoBuild: false,
      allowLatexmkRc: false,
    });

    await expect(session.compile("main.tex")).rejects.toMatchObject({
      code: "cleanup-busy",
    });
    await expect(update).resolves.toMatchObject({
      recipe: "latexmk-xelatex",
    });
  });

  it("describes a project without a detected LaTeX root", async () => {
    const project = await mkdtemp(join(tmpdir(), "texpulse-no-root-"));
    temporaryDirectories.push(project);
    await writeFile(join(project, "notes.txt"), "notes");

    const session = await ProjectSession.open(project, adapter());

    expect(session.describe().rootFile).toBeNull();
  });
});
