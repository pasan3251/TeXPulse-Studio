import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { NodeProcessRunner } from "../../src/process/process-runner.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("NodeProcessRunner", () => {
  it("preserves path and shell metacharacter arguments without a shell", async () => {
    const root = await mkdtemp(join(tmpdir(), "texpulse runner "));
    const scriptDirectory = join(root, "tools with spaces");
    const scriptPath = join(scriptDirectory, "echo-args.mjs");
    temporaryDirectories.push(root);
    await mkdir(scriptDirectory);
    await writeFile(
      scriptPath,
      "process.stdout.write(JSON.stringify(process.argv.slice(2)));",
    );

    const result = await new NodeProcessRunner().run({
      executable: process.execPath,
      args: [scriptPath, "value with spaces", "a&b", "$(not-executed)"],
      cwd: root,
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      "value with spaces",
      "a&b",
      "$(not-executed)",
    ]);
  });
});
