import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  loadProjectMetadata,
  saveProjectMetadata,
} from "../../src/project/project-metadata.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function createProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "texpulse-metadata-"));
  temporaryDirectories.push(root);
  return root;
}

describe("project metadata persistence", () => {
  it("uses defaults when absent and atomically persists valid metadata", async () => {
    const root = await createProject();
    await expect(loadProjectMetadata(root, "main.tex")).resolves.toMatchObject({
      source: "default",
      issues: [],
      metadata: { rootFile: "main.tex" },
    });

    const metadata = {
      schemaVersion: 1 as const,
      rootFile: "thesis.tex",
      recipe: "latexmk-lualatex" as const,
      buildDirectory: "generated output",
      autoBuild: false,
    };
    await saveProjectMetadata(root, metadata);
    await expect(loadProjectMetadata(root)).resolves.toEqual({
      source: "file",
      issues: [],
      metadata,
    });
  });

  it("falls back safely and reports malformed JSON", async () => {
    const root = await createProject();
    const metadataDirectory = join(root, ".texpulse");
    await saveProjectMetadata(root, {
      schemaVersion: 1,
      rootFile: null,
      recipe: "latexmk-pdf",
      buildDirectory: ".texpulse/build",
      autoBuild: true,
    });
    await writeFile(join(metadataDirectory, "project.json"), "{broken");

    await expect(loadProjectMetadata(root)).resolves.toMatchObject({
      source: "default",
      issues: ["Project metadata is not valid JSON."],
    });
  });
});
