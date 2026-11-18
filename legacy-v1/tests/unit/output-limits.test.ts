import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  inspectGeneratedOutput,
  removeGeneratedOutput,
} from "../../src/compiler/output-limits.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("generated output limits", () => {
  it("counts files and rejects excessive file count and size", async () => {
    const root = await mkdtemp(join(tmpdir(), "texpulse-output-limits-"));
    temporaryDirectories.push(root);
    await mkdir(join(root, "nested"));
    await writeFile(join(root, "one.log"), "1234");
    await writeFile(join(root, "nested", "two.aux"), "5678");

    await expect(
      inspectGeneratedOutput(root, {
        maxFileBytes: 10,
        maxFiles: 1,
        maxTotalBytes: 20,
      }),
    ).resolves.toMatchObject({
      violation: "Generated output exceeded 1 files.",
    });
    await expect(
      inspectGeneratedOutput(root, {
        maxFileBytes: 3,
        maxFiles: 10,
        maxTotalBytes: 20,
      }),
    ).resolves.toMatchObject({
      violation: "A generated file exceeded 3 bytes.",
    });
    await expect(
      inspectGeneratedOutput(root, {
        maxFileBytes: 10,
        maxFiles: 10,
        maxTotalBytes: 7,
      }),
    ).resolves.toMatchObject({
      violation: "Generated output exceeded 7 total bytes.",
    });
    await expect(
      inspectGeneratedOutput(root, {
        maxFileBytes: 10,
        maxFiles: 10,
        maxTotalBytes: 20,
      }),
    ).resolves.toEqual({
      files: 2,
      totalBytes: 8,
      violation: null,
    });
    await expect(
      inspectGeneratedOutput(root, {
        maxFileBytes: 0,
        maxFiles: 10,
        maxTotalBytes: 20,
      }),
    ).rejects.toThrow("maxFileBytes");
  });

  it("removes a rejected generation without following file links", async () => {
    const root = await mkdtemp(join(tmpdir(), "texpulse-output-cleanup-"));
    const external = await mkdtemp(join(tmpdir(), "texpulse-output-external-"));
    temporaryDirectories.push(root);
    temporaryDirectories.push(external);
    await writeFile(join(root, "main.log"), "bounded");
    await writeFile(join(external, "keep.txt"), "outside");
    await symlink(
      external,
      join(root, "linked-output"),
      process.platform === "win32" ? "junction" : "dir",
    );

    await expect(
      inspectGeneratedOutput(root, {
        maxFileBytes: 100,
        maxFiles: 10,
        maxTotalBytes: 100,
      }),
    ).resolves.toMatchObject({
      violation: "Generated output contained a filesystem link.",
    });

    await removeGeneratedOutput(root);
    await expect(mkdir(root)).resolves.toBeUndefined();
    await expect(readFile(join(external, "keep.txt"), "utf8")).resolves.toBe(
      "outside",
    );
    await expect(
      removeGeneratedOutput(join(root, "missing")),
    ).resolves.toBeUndefined();
  });
});
