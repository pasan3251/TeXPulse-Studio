import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  canonicalProjectRoot,
  normalizeProjectPath,
  resolveProjectPath,
} from "../../src/project/project-paths.js";
import { ProjectError } from "../../src/project/project-types.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "texpulse-paths-"));
  temporaryDirectories.push(path);
  return path;
}

describe("project path validation", () => {
  it("normalizes portable relative paths and rejects escapes", () => {
    expect(normalizeProjectPath("chapters\\intro.tex")).toBe(
      "chapters/intro.tex",
    );
    expect(() => normalizeProjectPath("../outside.tex")).toThrow(ProjectError);
    expect(() => normalizeProjectPath("C:\\outside.tex")).toThrow(ProjectError);
    expect(() => normalizeProjectPath(".")).toThrow(ProjectError);
  });

  it("canonicalizes an existing project directory", async () => {
    const directory = await temporaryDirectory();
    await expect(canonicalProjectRoot(directory)).resolves.toBe(
      await realpath(directory),
    );
  });

  it("rejects links and junctions inside a project", async () => {
    const root = await temporaryDirectory();
    const outside = await temporaryDirectory();
    await writeFile(join(outside, "outside.tex"), "outside");
    const linkPath = join(root, "linked");
    try {
      await symlink(
        outside,
        linkPath,
        process.platform === "win32" ? "junction" : "dir",
      );
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        ["EPERM", "EACCES"].includes(
          (error as NodeJS.ErrnoException).code ?? "",
        )
      ) {
        return;
      }
      throw error;
    }

    await expect(
      resolveProjectPath(root, "linked/outside.tex"),
    ).rejects.toMatchObject({
      code: "link-not-allowed",
    });
  });

  it("allows missing descendants only when requested", async () => {
    const root = await temporaryDirectory();
    await mkdir(join(root, "chapters"));
    await expect(
      resolveProjectPath(root, "chapters/new.tex", { allowMissing: true }),
    ).resolves.toBe(join(root, "chapters", "new.tex"));
    await expect(
      resolveProjectPath(root, "chapters/new.tex"),
    ).rejects.toMatchObject({
      code: "not-found",
    });
  });
});
