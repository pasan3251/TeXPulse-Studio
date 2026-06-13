import { copyFile, mkdtemp, readFile, rm, watch } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { MiktexCompilerAdapter } from "../../src/compiler/compiler-adapter.js";

const temporaryDirectories: string[] = [];
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const fakeLongRunningCompiler = join(
  currentDirectory,
  "fixtures",
  "fake-long-running-compiler.mjs",
);
const minimalFixture = join(
  currentDirectory,
  "..",
  "..",
  "fixtures",
  "minimal-success",
  "main.tex",
);

interface ProcessTreePids {
  parentPid: number;
  childPid: number;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function readProcessTreePids(path: string): Promise<ProcessTreePids> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as ProcessTreePids;
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw error;
    }
  }

  const abortController = new AbortController();
  const watcher = watch(dirname(path), { signal: abortController.signal });
  const guard = setTimeout(() => {
    abortController.abort();
  }, 5_000);
  try {
    for await (const event of watcher) {
      if (
        event.filename === null ||
        join(dirname(path), event.filename) === path
      ) {
        try {
          return JSON.parse(await readFile(path, "utf8")) as ProcessTreePids;
        } catch (error) {
          if (
            !(error instanceof Error) ||
            !("code" in error) ||
            error.code !== "ENOENT"
          ) {
            throw error;
          }
        }
      }
    }
  } finally {
    clearTimeout(guard);
    abortController.abort();
  }

  throw new Error("Timed out waiting for the fake compiler PID file.");
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(
      error instanceof Error &&
      "code" in error &&
      error.code === "ESRCH"
    );
  }
}

async function createLongRunningAdapter(testName: string): Promise<{
  adapter: MiktexCompilerAdapter;
  project: string;
  pidFile: string;
}> {
  const project = await mkdtemp(join(tmpdir(), `texpulse-${testName}-`));
  const pidFile = join(project, "process-tree.json");
  temporaryDirectories.push(project);
  await copyFile(minimalFixture, join(project, "main.tex"));

  return {
    adapter: new MiktexCompilerAdapter({
      latexmkCommand: {
        executable: process.execPath,
        prefixArgs: [fakeLongRunningCompiler, `--pid-file=${pidFile}`],
      },
      engineExecutable: process.execPath,
    }),
    project,
    pidFile,
  };
}

describe("compiler process cleanup", () => {
  it("terminates the complete process tree after cancellation", async () => {
    const { adapter, project, pidFile } =
      await createLongRunningAdapter("cancel");
    const resultPromise = adapter.compile({
      buildId: "cancel-build",
      generation: 1,
      projectDirectory: project,
      rootFile: "main.tex",
      timeoutMs: 10_000,
    });
    const pids = await readProcessTreePids(pidFile);

    await expect(adapter.cancel("cancel-build")).resolves.toBe(true);
    const result = await resultPromise;

    expect(result.status).toBe("cancelled");
    expect(result.failureReason).toBe("Build was cancelled.");
    expect(processExists(pids.parentPid)).toBe(false);
    expect(processExists(pids.childPid)).toBe(false);
  });

  it("terminates the complete process tree after timeout", async () => {
    const { adapter, project, pidFile } =
      await createLongRunningAdapter("timeout");
    const resultPromise = adapter.compile({
      buildId: "timeout-build",
      generation: 1,
      projectDirectory: project,
      rootFile: "main.tex",
      timeoutMs: 500,
    });
    const pids = await readProcessTreePids(pidFile);
    const result = await resultPromise;

    expect(result.status).toBe("timed-out");
    expect(result.failureReason).toBe("Build exceeded the 500 ms timeout.");
    expect(processExists(pids.parentPid)).toBe(false);
    expect(processExists(pids.childPid)).toBe(false);
  });
});
