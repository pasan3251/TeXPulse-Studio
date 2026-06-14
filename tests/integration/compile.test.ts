import { copyFile, mkdtemp, mkdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { MiktexCompilerAdapter } from "../../src/compiler/compiler-adapter.js";
import { compileProject } from "../../src/compiler/miktex-compiler.js";

const temporaryDirectories: string[] = [];
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const fakeLatexmk = join(currentDirectory, "fixtures", "fake-latexmk.mjs");
const minimalFixture = join(
  currentDirectory,
  "..",
  "..",
  "fixtures",
  "minimal-success",
  "main.tex",
);

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("compileProject", () => {
  it("returns a structured success from a fake compiler in a spaced path", async () => {
    const parent = await mkdtemp(join(tmpdir(), "texpulse compile "));
    const project = join(parent, "project with spaces");
    const customBinDirectory = join(project, "custom tools");
    temporaryDirectories.push(parent);
    await mkdir(project);
    await mkdir(customBinDirectory);
    await copyFile(minimalFixture, join(project, "main.tex"));

    const result = await new MiktexCompilerAdapter({
      latexmkCommand: {
        executable: process.execPath,
        prefixArgs: [fakeLatexmk],
      },
      engineExecutable: process.execPath,
    }).compile({
      projectDirectory: project,
      rootFile: "main.tex",
      customBinDirectory,
    });

    expect(result).toMatchObject({
      status: "succeeded",
      exitCode: 0,
      projectDirectory: project,
      failureReason: null,
    });
    expect(result.pdfPath).toContain("project with spaces");
    expect(result.args).toContain("-no-shell-escape");
    expect(result.args).toContain("-norc");
    expect(JSON.parse(result.stdout)).toMatchObject({
      cwd: project,
      path: expect.stringMatching(/^.*custom tools/i),
    });
  });

  it("reports a missing root file without launching a process", async () => {
    const project = await mkdtemp(join(tmpdir(), "texpulse missing root "));
    temporaryDirectories.push(project);

    const result = await compileProject({
      projectDirectory: project,
      rootFile: "missing.tex",
    });

    expect(result.status).toBe("failed");
    expect(result.executable).toBeNull();
    expect(result.failureReason).toBeTruthy();
  });

  it("reports a missing selected engine before launching latexmk", async () => {
    const project = await mkdtemp(join(tmpdir(), "texpulse missing engine "));
    temporaryDirectories.push(project);
    await copyFile(minimalFixture, join(project, "main.tex"));

    const result = await compileProject(
      {
        projectDirectory: project,
        rootFile: "main.tex",
        recipe: "xelatex",
      },
      {
        latexmkCommand: {
          executable: process.execPath,
          prefixArgs: [fakeLatexmk],
        },
        engineExecutable: null,
      },
    );

    expect(result.status).toBe("failed");
    expect(result.executable).toBeNull();
    expect(result.failureReason).toContain("xelatex was not found");
  });

  it("preserves a nonzero compiler exit in the structured result", async () => {
    const project = await mkdtemp(join(tmpdir(), "texpulse failed compile "));
    temporaryDirectories.push(project);
    await copyFile(minimalFixture, join(project, "main.tex"));

    const result = await compileProject(
      {
        projectDirectory: project,
        rootFile: "main.tex",
      },
      {
        latexmkCommand: {
          executable: process.execPath,
          prefixArgs: [fakeLatexmk, "--fake-exit"],
        },
        engineExecutable: process.execPath,
      },
    );

    expect(result).toMatchObject({
      status: "failed",
      exitCode: 3,
      failureReason: "latexmk exited with code 3.",
    });
    expect(result.stderr).toContain("Fake compiler failure");
  });

  it("rejects a successful exit that produced no PDF", async () => {
    const project = await mkdtemp(join(tmpdir(), "texpulse no pdf "));
    temporaryDirectories.push(project);
    await copyFile(minimalFixture, join(project, "main.tex"));

    const result = await compileProject(
      {
        projectDirectory: project,
        rootFile: "main.tex",
      },
      {
        latexmkCommand: {
          executable: process.execPath,
          prefixArgs: [fakeLatexmk, "--fake-no-pdf"],
        },
        engineExecutable: process.execPath,
      },
    );

    expect(result).toMatchObject({
      status: "failed",
      exitCode: 0,
      pdfPath: null,
      failureReason:
        "latexmk exited successfully but did not produce a readable PDF.",
    });
  });

  it("rejects and removes a generation that exceeds output quotas", async () => {
    const project = await mkdtemp(join(tmpdir(), "texpulse output quota "));
    temporaryDirectories.push(project);
    await copyFile(minimalFixture, join(project, "main.tex"));

    const result = await compileProject(
      {
        projectDirectory: project,
        rootFile: "main.tex",
      },
      {
        latexmkCommand: {
          executable: process.execPath,
          prefixArgs: [fakeLatexmk],
        },
        engineExecutable: process.execPath,
        outputLimits: {
          maxFileBytes: 1024 * 1024,
          maxFiles: 2,
          maxTotalBytes: 10 * 1024 * 1024,
        },
      },
    );

    expect(result).toMatchObject({
      status: "failed",
      pdfPath: null,
      outputTruncated: true,
      failureReason: "Generated output exceeded 2 files.",
    });
    await expect(stat(result.buildDirectory!)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
