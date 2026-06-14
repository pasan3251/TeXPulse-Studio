import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { pruneGenerationDirectories } from "../../src/compiler/generation-retention.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("build generation retention", () => {
  it("keeps the preserved generation, newest bounded set, and unknown directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "texpulse-generations-"));
    temporaryDirectories.push(root);
    for (let generation = 1; generation <= 5; generation += 1) {
      const name = generationName(generation);
      await mkdir(join(root, name));
      await writeFile(join(root, name, "main.log"), "output");
    }
    await mkdir(join(root, "6-user-output"));
    await writeFile(join(root, "6-user-output", "keep.txt"), "preserve");

    await expect(
      pruneGenerationDirectories(root, new Set([generationName(1)]), 3),
    ).resolves.toBe(2);
    await expect(readdir(root)).resolves.toEqual(
      expect.arrayContaining([
        generationName(1),
        generationName(4),
        generationName(5),
        "6-user-output",
      ]),
    );
    expect(await readdir(root)).toHaveLength(4);
  });

  it("accepts a missing directory and rejects invalid retention limits", async () => {
    const root = await mkdtemp(join(tmpdir(), "texpulse-generations-empty-"));
    temporaryDirectories.push(root);

    await expect(
      pruneGenerationDirectories(join(root, "missing"), new Set()),
    ).resolves.toBe(0);
    await expect(
      pruneGenerationDirectories(root, new Set(), 0),
    ).rejects.toThrow("positive safe integer");
  });
});

function generationName(generation: number): string {
  return `${String(generation)}-00000000-0000-4000-8000-${String(generation).padStart(12, "0")}`;
}
