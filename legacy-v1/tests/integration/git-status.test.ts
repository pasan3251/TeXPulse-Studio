import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { NodeProcessRunner } from "../../src/process/process-runner.js";
import { readGitStatus } from "../../src/project/git-status.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("readGitStatus", () => {
  it("reports not-a-repository for ordinary project folders", async () => {
    const project = await mkdtemp(join(tmpdir(), "texpulse-git-status-"));
    temporaryDirectories.push(project);

    await expect(readGitStatus(project)).resolves.toMatchObject({
      state: "not-a-repository",
      hasChanges: false,
    });
  });

  it("summarizes a real repository through argument-array Git execution", async () => {
    const project = await mkdtemp(join(tmpdir(), "texpulse-git-status-"));
    temporaryDirectories.push(project);
    await runGit(project, ["init"]);
    await writeFile(join(project, "main.tex"), "\\documentclass{article}\n");

    await expect(readGitStatus(project)).resolves.toMatchObject({
      state: "repository",
      untrackedCount: 1,
      stagedCount: 0,
      hasChanges: true,
    });

    await runGit(project, ["add", "main.tex"]);
    await expect(readGitStatus(project)).resolves.toMatchObject({
      state: "repository",
      untrackedCount: 0,
      stagedCount: 1,
      hasChanges: true,
    });
  });
});

async function runGit(cwd: string, args: readonly string[]): Promise<void> {
  const result = await new NodeProcessRunner().run({
    executable: "git",
    args,
    cwd,
    timeoutMs: 10_000,
  });
  expect(result.error).toBeNull();
  expect(result.exitCode).toBe(0);
}
