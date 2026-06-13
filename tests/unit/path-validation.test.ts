import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { validateCompilePaths } from "../../src/compiler/path-validation.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("validateCompilePaths", () => {
  it("accepts project paths containing spaces", async () => {
    const parent = await mkdtemp(join(tmpdir(), "texpulse paths "));
    const project = join(parent, "project with spaces");
    temporaryDirectories.push(parent);
    await mkdir(project);
    await writeFile(join(project, "main.tex"), "\\documentclass{article}\n");

    const result = await validateCompilePaths(
      project,
      "main.tex",
      ".texpulse/build",
    );

    expect(result.projectDirectory).toBe(project);
    expect(result.buildDirectory).toContain("project with spaces");
  });

  it("rejects a root file outside the project", async () => {
    const parent = await mkdtemp(join(tmpdir(), "texpulse-boundary-"));
    const project = join(parent, "project");
    temporaryDirectories.push(parent);
    await mkdir(project);
    await writeFile(join(parent, "outside.tex"), "outside");

    await expect(
      validateCompilePaths(project, "../outside.tex", ".texpulse/build"),
    ).rejects.toThrow("inside the project");
  });

  it("rejects a non-TeX root file", async () => {
    const project = await mkdtemp(join(tmpdir(), "texpulse-extension-"));
    temporaryDirectories.push(project);
    await writeFile(join(project, "main.txt"), "main");

    await expect(
      validateCompilePaths(project, "main.txt", ".texpulse/build"),
    ).rejects.toThrow(".tex extension");
  });

  it("rejects a root path that is a directory", async () => {
    const project = await mkdtemp(join(tmpdir(), "texpulse-root-dir-"));
    temporaryDirectories.push(project);
    await mkdir(join(project, "main.tex"));

    await expect(
      validateCompilePaths(project, "main.tex", ".texpulse/build"),
    ).rejects.toThrow("regular file");
  });

  it("rejects a project path that is a file", async () => {
    const parent = await mkdtemp(join(tmpdir(), "texpulse-project-file-"));
    const projectFile = join(parent, "project");
    temporaryDirectories.push(parent);
    await writeFile(projectFile, "not a directory");

    await expect(
      validateCompilePaths(projectFile, "main.tex", ".texpulse/build"),
    ).rejects.toThrow("must be a directory");
  });

  it("rejects the project root as a build directory", async () => {
    const project = await mkdtemp(join(tmpdir(), "texpulse-build-"));
    temporaryDirectories.push(project);
    await writeFile(join(project, "main.tex"), "main");

    await expect(
      validateCompilePaths(project, "main.tex", "."),
    ).rejects.toThrow("child of the project");
  });

  it("rejects a lexical build path outside the project", async () => {
    const project = await mkdtemp(join(tmpdir(), "texpulse-build-outside-"));
    temporaryDirectories.push(project);
    await writeFile(join(project, "main.tex"), "main");

    await expect(
      validateCompilePaths(project, "main.tex", "../build"),
    ).rejects.toThrow("child of the project");
  });

  it("rejects a build path redirected outside by a filesystem link", async () => {
    const parent = await mkdtemp(join(tmpdir(), "texpulse-build-link-"));
    const project = join(parent, "project");
    const outside = join(parent, "outside");
    temporaryDirectories.push(parent);
    await mkdir(project);
    await mkdir(outside);
    await writeFile(join(project, "main.tex"), "main");
    await symlink(
      outside,
      join(project, ".texpulse"),
      process.platform === "win32" ? "junction" : "dir",
    );

    await expect(
      validateCompilePaths(project, "main.tex", ".texpulse/build"),
    ).rejects.toThrow("resolves outside");
  });
});
