import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {
        force: true,
        recursive: true,
      }),
    ),
  );
});

describe("TypeScript strict-mode control", () => {
  it("rejects an implicit any parameter", async () => {
    const directory = await mkdtemp(join(tmpdir(), "texpulse-strict-"));
    const fixture = join(directory, "implicit-any.ts");
    temporaryDirectories.push(directory);
    await writeFile(
      fixture,
      "export function invalid(value) { return value; }\n",
    );

    const program = ts.createProgram([fixture], {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      noEmit: true,
      skipLibCheck: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
    });
    const diagnosticCodes = ts
      .getPreEmitDiagnostics(program)
      .map((diagnostic) => diagnostic.code);

    expect(diagnosticCodes).toContain(7006);
  }, 15_000);
});
