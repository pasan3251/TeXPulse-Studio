import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { cleanupAuxiliaryFiles } from "../../src/compiler/auxiliary-cleanup.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("cleanupAuxiliaryFiles", () => {
  it("removes only allowlisted generated files and preserves PDFs and logs", async () => {
    const project = await mkdtemp(join(tmpdir(), "texpulse-cleanup-"));
    temporaryDirectories.push(project);
    const generation = join(
      project,
      ".texpulse",
      "build",
      "generations",
      "1-build",
    );
    await mkdir(join(generation, "chapters"), { recursive: true });
    await writeFile(join(generation, "main.aux"), "aux");
    await writeFile(join(generation, "main.run.xml"), "xml");
    await writeFile(join(generation, "chapters", "intro.toc"), "toc");
    await writeFile(join(generation, "main.pdf"), "pdf");
    await writeFile(join(generation, "main.log"), "log");
    await writeFile(join(generation, "notes.txt"), "keep");

    await expect(
      cleanupAuxiliaryFiles(project, ".texpulse/build"),
    ).resolves.toBe(3);
    await expect(readFile(join(generation, "main.pdf"), "utf8")).resolves.toBe(
      "pdf",
    );
    await expect(readFile(join(generation, "main.log"), "utf8")).resolves.toBe(
      "log",
    );
    await expect(readFile(join(generation, "notes.txt"), "utf8")).resolves.toBe(
      "keep",
    );
    await expect(readFile(join(generation, "main.aux"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("returns zero when no generation directory exists", async () => {
    const project = await mkdtemp(join(tmpdir(), "texpulse-cleanup-empty-"));
    temporaryDirectories.push(project);

    await expect(
      cleanupAuxiliaryFiles(project, ".texpulse/build"),
    ).resolves.toBe(0);
  });

  it("does not traverse generated-directory links or junctions", async () => {
    const project = await mkdtemp(join(tmpdir(), "texpulse-cleanup-link-"));
    const outside = await mkdtemp(join(tmpdir(), "texpulse-cleanup-outside-"));
    temporaryDirectories.push(project, outside);
    const generations = join(project, ".texpulse", "build", "generations");
    await mkdir(generations, { recursive: true });
    await writeFile(join(outside, "outside.aux"), "preserve");
    await symlink(
      outside,
      join(generations, "linked-generation"),
      process.platform === "win32" ? "junction" : "dir",
    );

    await expect(
      cleanupAuxiliaryFiles(project, ".texpulse/build"),
    ).resolves.toBe(0);
    await expect(readFile(join(outside, "outside.aux"), "utf8")).resolves.toBe(
      "preserve",
    );
  });
});
