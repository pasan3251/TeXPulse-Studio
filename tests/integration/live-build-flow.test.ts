import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { BuildController } from "../../src/build/build-controller.js";
import type { CompilerAdapter } from "../../src/compiler/compiler-adapter.js";
import type {
  CompileRequest,
  CompileResult,
} from "../../src/compiler/compile-types.js";
import {
  LiveBuildCoordinator,
  type LiveBuildPhase,
} from "../../src/renderer/live-build-coordinator.js";
import type { ToolchainProbe } from "../../src/toolchain/toolchain-probe.js";

interface ActiveCompile {
  request: CompileRequest;
  source: string;
  resolve: (result: CompileResult) => void;
}

class SourceRecordingAdapter implements CompilerAdapter {
  readonly requests: ActiveCompile[] = [];
  activeCount = 0;
  maxActiveCount = 0;

  constructor(private readonly source: () => string) {}

  probe(): Promise<ToolchainProbe> {
    return Promise.resolve({
      tools: [],
      requiredToolsAvailable: true,
      issues: [],
    });
  }

  compile(request: CompileRequest): Promise<CompileResult> {
    this.activeCount += 1;
    this.maxActiveCount = Math.max(this.maxActiveCount, this.activeCount);
    return new Promise((resolve) => {
      this.requests.push({
        request,
        source: this.source(),
        resolve: (result) => {
          this.activeCount -= 1;
          resolve(result);
        },
      });
    });
  }

  cancel(): Promise<boolean> {
    return Promise.resolve(false);
  }

  complete(index: number): void {
    const active = this.requests[index];
    if (active === undefined) {
      throw new Error(`Missing controlled compile ${String(index)}.`);
    }
    const buildDirectory = active.request.buildDirectory!;
    const endedAt = new Date().toISOString();
    active.resolve({
      buildId: active.request.buildId!,
      generation: active.request.generation!,
      status: "succeeded",
      exitCode: 0,
      startedAt: endedAt,
      endedAt,
      durationMs: 1,
      executable: "fake",
      args: [],
      projectDirectory: active.request.projectDirectory,
      rootFile: join(active.request.projectDirectory, "main.tex"),
      buildDirectory,
      pdfPath: join(buildDirectory, "main.pdf"),
      logPath: join(buildDirectory, "main.log"),
      synctexPath: null,
      stdout: "",
      stderr: "",
      failureReason: null,
    });
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("live build integration", () => {
  it("runs one compiler at a time and displays only the newest saved source", async () => {
    vi.useFakeTimers();
    let editorSource = "first";
    let savedSource = "";
    const displayedSources: string[] = [];
    const phases: LiveBuildPhase[] = [];
    const adapter = new SourceRecordingAdapter(() => savedSource);
    const controller = new BuildController(adapter, {
      projectDirectory: "C:\\project",
      idFactory: (() => {
        let id = 0;
        return () => `build-${String(++id)}`;
      })(),
    });
    const coordinator = new LiveBuildCoordinator({
      save: () => {
        savedSource = editorSource;
        return Promise.resolve(true);
      },
      build: async (revision) => {
        const requestedSource = savedSource;
        const ticket = controller.requestBuild({ rootFile: "main.tex" });
        const completion = await ticket.completion;
        if (
          completion.disposition === "current" &&
          coordinator.isCurrentRevision(revision)
        ) {
          displayedSources.push(requestedSource);
        }
      },
      onPhaseChange: (phase) => {
        phases.push(phase);
      },
      onBuildBlocked: vi.fn(),
      onUnexpectedError: (error) => {
        throw error;
      },
    });

    coordinator.noteEdit();
    await vi.advanceTimersByTimeAsync(800);
    expect(adapter.requests.map((request) => request.source)).toEqual([
      "first",
    ]);

    for (let index = 1; index <= 25; index += 1) {
      editorSource = `rapid-${String(index)}`;
      coordinator.noteEdit();
    }
    await vi.advanceTimersByTimeAsync(800);
    expect(adapter.requests).toHaveLength(1);
    expect(phases).toContain("queued");

    adapter.complete(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(adapter.requests.map((request) => request.source)).toEqual([
      "first",
      "rapid-25",
    ]);

    adapter.complete(1);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(adapter.maxActiveCount).toBe(1);
    expect(displayedSources).toEqual(["rapid-25"]);
    expect(controller.getSnapshot().lastSuccessfulBuild?.generation).toBe(2);
    expect(phases.slice(-2)).toEqual(["compiling", "idle"]);
  });
});
