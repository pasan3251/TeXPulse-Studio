import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { CompileRecipe } from "../../src/compiler/compile-types.js";
import { compileProject } from "../../src/compiler/miktex-compiler.js";

const temporaryDirectories: string[] = [];
const repositoryRoot = resolve(import.meta.dirname, "..", "..");
const nativeDescribe =
  process.env.TEXPULSE_RUN_NATIVE === "1" ? describe : describe.skip;

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

nativeDescribe("native MiKTeX recipes", () => {
  it.each([
    ["minimal-success", "pdf"],
    ["unicode-xelatex", "xelatex"],
    ["minimal-success", "lualatex"],
    ["bibliography-bibtex", "pdf"],
    ["bibliography-biber", "pdf"],
  ] as const)(
    "compiles the %s fixture with the %s recipe",
    async (fixture, recipe) => {
      const project = await mkdtemp(join(tmpdir(), "texpulse-native-"));
      temporaryDirectories.push(project);
      await cp(join(repositoryRoot, "fixtures", fixture), project, {
        recursive: true,
      });

      const result = await compileProject({
        projectDirectory: project,
        rootFile: "main.tex",
        recipe: recipe as CompileRecipe,
        timeoutMs: 120_000,
      });

      expect(result.status, result.failureReason ?? result.stderr).toBe(
        "succeeded",
      );
      expect(result.pdfPath).not.toBeNull();
      if (result.pdfPath !== null) {
        expect((await readFile(result.pdfPath)).subarray(0, 5).toString()).toBe(
          "%PDF-",
        );
      }
    },
    150_000,
  );
});
