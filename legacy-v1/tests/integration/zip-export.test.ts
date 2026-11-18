import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { exportProjectZip } from "../../src/project/zip-export.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("project ZIP export", () => {
  it("exports source files and excludes generated and dependency directories", async () => {
    const parent = await mkdtemp(join(tmpdir(), "texpulse-zip-"));
    temporaryDirectories.push(parent);
    const project = join(parent, "project with spaces");
    const destination = join(parent, "project.zip");
    await mkdir(join(project, "chapters"), { recursive: true });
    await mkdir(join(project, ".texpulse", "build"), { recursive: true });
    await mkdir(join(project, "node_modules", "package"), { recursive: true });
    await writeFile(join(project, "main.tex"), "main source");
    await writeFile(join(project, "chapters", "intro.tex"), "intro source");
    await writeFile(join(project, ".texpulse", "build", "main.pdf"), "pdf");
    await writeFile(
      join(project, "node_modules", "package", "index.js"),
      "dependency",
    );

    await expect(exportProjectZip(project, destination)).resolves.toEqual({
      files: 2,
      skippedLinks: 0,
      totalBytes: 23,
    });
    const bytes = await readFile(destination);
    expect(bytes.readUInt32LE(0)).toBe(0x04034b50);
    expect(bytes.includes(Buffer.from("main.tex"))).toBe(true);
    expect(bytes.includes(Buffer.from("chapters/intro.tex"))).toBe(true);
    expect(bytes.includes(Buffer.from(".texpulse"))).toBe(false);
    expect(bytes.includes(Buffer.from("node_modules"))).toBe(false);
    expect(bytes.readUInt32LE(bytes.length - 22)).toBe(0x06054b50);
  });
});
