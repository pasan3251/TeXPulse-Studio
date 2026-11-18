import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { afterAll, describe, expect, it } from "vitest";

import { BuildController } from "../../src/build/build-controller.js";
import type { CompilerAdapter } from "../../src/compiler/compiler-adapter.js";
import type {
  CompileRequest,
  CompileResult,
} from "../../src/compiler/compile-types.js";
import { ProjectService } from "../../src/project/project-service.js";
import { buildProjectTree } from "../../src/renderer/project-tree.js";
import {
  initialWorkspaceState,
  workspaceReducer,
} from "../../src/renderer/workspace-state.js";
import type { WorkspaceState } from "../../src/renderer/workspace-state.js";

const temporaryDirectories: string[] = [];

afterAll(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("release-candidate performance", () => {
  it("opens and constructs a hierarchy for 1,000 ordinary files without a long task", async () => {
    const project = await mkdtemp(join(tmpdir(), "texpulse-perf-"));
    temporaryDirectories.push(project);
    const directories = Array.from({ length: 20 }, (_, index) =>
      join(project, `chapter-${String(index).padStart(2, "0")}`),
    );
    await Promise.all(directories.map((directory) => mkdir(directory)));
    await Promise.all(
      Array.from({ length: 1_000 }, (_, index) =>
        writeFile(
          join(
            directories[index % directories.length]!,
            `file-${String(index).padStart(4, "0")}.tex`,
          ),
          `File ${String(index)}\n`,
        ),
      ),
    );

    const service = await ProjectService.open(project);
    const enumerationStarted = performance.now();
    const entries = await service.listEntries();
    const enumerationMs = performance.now() - enumerationStarted;
    const treeStarted = performance.now();
    const tree = buildProjectTree(entries);
    const treeMs = performance.now() - treeStarted;

    expect(entries.filter((entry) => entry.kind === "file")).toHaveLength(
      1_000,
    );
    expect(tree).toHaveLength(20);
    expect(enumerationMs).toBeLessThan(10_000);
    expect(treeMs).toBeLessThan(50);
    console.info(
      JSON.stringify({
        check: "project-1000-files",
        enumerationMs: Math.round(enumerationMs),
        treeMs: Number(treeMs.toFixed(2)),
      }),
    );
  });

  it("keeps normal editor reducer input below the 50 ms target", () => {
    const baseState = {
      ...initialWorkspaceState,
      buffers: {
        "main.tex": {
          path: "main.tex",
          content: "",
          savedContent: "",
          version: "a".repeat(64),
          cursor: 0,
          scrollTop: 0,
        },
      },
      activePath: "main.tex",
    };
    const timings: number[] = [];
    let state: WorkspaceState = baseState;
    for (let index = 0; index < 2_000; index += 1) {
      const started = performance.now();
      state = workspaceReducer(state, {
        type: "content-changed",
        path: "main.tex",
        content: `revision ${String(index)}`,
      });
      timings.push(performance.now() - started);
    }
    timings.sort((left, right) => left - right);
    const p95 = timings[Math.floor(timings.length * 0.95)]!;

    expect(p95).toBeLessThan(50);
    expect(state.buffers["main.tex"]?.content).toBe("revision 1999");
    console.info(
      JSON.stringify({
        check: "editor-input",
        p95Ms: Number(p95.toFixed(3)),
        maximumMs: Number(timings.at(-1)!.toFixed(3)),
      }),
    );
  });

  it("does not retain unbounded heap across repeated builds", async () => {
    const adapter = new ImmediateAdapter();
    let nextId = 0;
    const controller = new BuildController(adapter, {
      projectDirectory: "C:\\release-candidate",
      idFactory: () => `memory-${String(++nextId)}`,
    });
    global.gc?.();
    const before = process.memoryUsage().heapUsed;

    for (let index = 0; index < 500; index += 1) {
      await controller.requestBuild({ rootFile: "main.tex" }).completion;
    }
    global.gc?.();
    const after = process.memoryUsage().heapUsed;
    const growthBytes = Math.max(0, after - before);

    expect(adapter.builds).toBe(500);
    expect(growthBytes).toBeLessThan(16 * 1024 * 1024);
    console.info(
      JSON.stringify({
        check: "repeated-build-memory",
        builds: adapter.builds,
        heapGrowthBytes: growthBytes,
      }),
    );
  });
});

class ImmediateAdapter implements CompilerAdapter {
  builds = 0;

  probe(): Promise<never> {
    throw new Error("Probe is not used by the performance check.");
  }

  compile(request: CompileRequest): Promise<CompileResult> {
    this.builds += 1;
    const completedAt = new Date(0).toISOString();
    return Promise.resolve({
      buildId: request.buildId!,
      generation: request.generation!,
      status: "succeeded",
      exitCode: 0,
      startedAt: completedAt,
      endedAt: completedAt,
      durationMs: 0,
      executable: "memory-adapter",
      args: [],
      projectDirectory: request.projectDirectory,
      rootFile: request.rootFile,
      buildDirectory: request.buildDirectory ?? null,
      pdfPath: join(request.buildDirectory!, "main.pdf"),
      logPath: null,
      synctexPath: null,
      stdout: "",
      stderr: "",
      outputTruncated: false,
      failureReason: null,
    });
  }

  cancel(): Promise<boolean> {
    return Promise.resolve(false);
  }
}
