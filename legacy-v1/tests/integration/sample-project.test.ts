import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createProjectFromTemplate,
  ensureSampleProject,
} from "../../src/project/sample-project.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function createDirectory(prefix: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(path);
  return path;
}

describe("sample project", () => {
  it("copies the bundled sample once and preserves later user edits", async () => {
    const source = await createDirectory("texpulse-sample-source-");
    const targetParent = await createDirectory("texpulse-sample-target-");
    const target = join(targetParent, "sample-project");
    await writeFile(join(source, "main.tex"), "Bundled sample\n");

    await expect(ensureSampleProject(source, target)).resolves.toBe(target);
    await expect(readFile(join(target, "main.tex"), "utf8")).resolves.toBe(
      "Bundled sample\n",
    );

    await writeFile(join(target, "main.tex"), "User edit\n");
    await ensureSampleProject(source, target);
    await expect(readFile(join(target, "main.tex"), "utf8")).resolves.toBe(
      "User edit\n",
    );
  });

  it("rejects an unsafe destination instead of replacing it", async () => {
    const source = await createDirectory("texpulse-sample-source-");
    const targetParent = await createDirectory("texpulse-sample-target-");
    const target = join(targetParent, "sample-project");
    await writeFile(join(source, "main.tex"), "Bundled sample\n");
    await writeFile(target, "not a directory");

    await expect(ensureSampleProject(source, target)).rejects.toThrow(
      /not a safe directory/u,
    );
    await expect(readFile(target, "utf8")).resolves.toBe("not a directory");
  });

  it("contains concurrent creation and rejects unsafe sample entries", async () => {
    const source = await createDirectory("texpulse-sample-source-");
    const targetParent = await createDirectory("texpulse-sample-target-");
    const target = join(targetParent, "sample-project");
    await writeFile(join(source, "main.tex"), "Bundled sample\n");

    await expect(
      Promise.all([
        ensureSampleProject(source, target),
        ensureSampleProject(source, target),
      ]),
    ).resolves.toEqual([target, target]);

    await rm(join(target, "main.tex"));
    await mkdir(join(target, "main.tex"));
    await expect(ensureSampleProject(source, target)).rejects.toThrow(
      /Sample destination is invalid/u,
    );
  });

  it("creates a new project only at a missing destination", async () => {
    const source = await createDirectory("texpulse-template-source-");
    const targetParent = await createDirectory("texpulse-template-target-");
    const target = join(targetParent, "New Project");
    await writeFile(join(source, "main.tex"), "Template source\n");

    await expect(createProjectFromTemplate(source, target)).resolves.toBe(
      target,
    );
    await expect(readFile(join(target, "main.tex"), "utf8")).resolves.toBe(
      "Template source\n",
    );
    await expect(createProjectFromTemplate(source, target)).rejects.toThrow(
      /already exists/u,
    );
  });
});
