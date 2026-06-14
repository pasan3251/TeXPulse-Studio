import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { BuildController } from "../../src/build/build-controller.js";
import type { BuildPhase } from "../../src/build/build-types.js";
import type { CompilerAdapter } from "../../src/compiler/compiler-adapter.js";
import type {
  CompileRequest,
  CompileResult,
  CompileStatus,
} from "../../src/compiler/compile-types.js";
import type { ToolchainProbe } from "../../src/toolchain/toolchain-probe.js";

interface ControlledBuild {
  request: CompileRequest;
  resolve: (result: CompileResult) => void;
}

function compileResult(
  request: CompileRequest,
  status: CompileStatus,
): CompileResult {
  const succeeded = status === "succeeded";
  const endedAt = "2026-06-13T12:00:01.000Z";
  const buildDirectory = request.buildDirectory ?? null;
  return {
    buildId: request.buildId ?? "missing-build-id",
    generation: request.generation ?? 0,
    status,
    exitCode: succeeded ? 0 : null,
    startedAt: "2026-06-13T12:00:00.000Z",
    endedAt,
    durationMs: 1_000,
    executable: "fake-latexmk",
    args: [],
    projectDirectory: request.projectDirectory,
    rootFile: join(request.projectDirectory, request.rootFile),
    buildDirectory,
    pdfPath:
      succeeded && buildDirectory !== null
        ? join(buildDirectory, "main.pdf")
        : null,
    logPath: buildDirectory === null ? null : join(buildDirectory, "main.log"),
    synctexPath:
      succeeded && buildDirectory !== null
        ? join(buildDirectory, "main.synctex.gz")
        : null,
    stdout: "",
    stderr: "",
    outputTruncated: false,
    failureReason: succeeded ? null : `Fake ${status} result.`,
  };
}

class ControlledAdapter implements CompilerAdapter {
  readonly requests: CompileRequest[] = [];
  readonly controlledBuilds = new Map<string, ControlledBuild>();
  activeCount = 0;
  maxActiveCount = 0;

  probe(): Promise<ToolchainProbe> {
    return Promise.resolve({
      tools: [],
      requiredToolsAvailable: true,
      issues: [],
    });
  }

  compile(request: CompileRequest): Promise<CompileResult> {
    const buildId = request.buildId ?? "missing-build-id";
    this.requests.push(request);
    this.activeCount += 1;
    this.maxActiveCount = Math.max(this.maxActiveCount, this.activeCount);

    return new Promise((resolve) => {
      this.controlledBuilds.set(buildId, {
        request,
        resolve: (result) => {
          this.activeCount -= 1;
          this.controlledBuilds.delete(buildId);
          resolve(result);
        },
      });
    });
  }

  cancel(buildId: string): Promise<boolean> {
    const build = this.controlledBuilds.get(buildId);
    if (build === undefined) {
      return Promise.resolve(false);
    }

    build.resolve(compileResult(build.request, "cancelled"));
    return Promise.resolve(true);
  }

  complete(buildId: string, status: CompileStatus): void {
    const build = this.controlledBuilds.get(buildId);
    if (build === undefined) {
      throw new Error(`Unknown controlled build: ${buildId}`);
    }
    build.resolve(compileResult(build.request, status));
  }
}

class ThrowingAdapter extends ControlledAdapter {
  override compile(): Promise<CompileResult> {
    return Promise.reject(new Error("Fake adapter crash."));
  }
}

class MismatchedAdapter extends ControlledAdapter {
  override async compile(request: CompileRequest): Promise<CompileResult> {
    return {
      ...compileResult(request, "succeeded"),
      buildId: "different-build",
      generation: 999,
    };
  }
}

function createController(adapter: ControlledAdapter): BuildController {
  let nextId = 0;
  return new BuildController(adapter, {
    projectDirectory: "C:\\project",
    timeoutMs: 5_000,
    idFactory: () => `build-${String(++nextId)}`,
  });
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
});

describe("BuildController", () => {
  it("publishes every successful manual-build transition", async () => {
    const adapter = new ControlledAdapter();
    const controller = createController(adapter);
    const phases: BuildPhase[] = [];
    controller.subscribe((snapshot) => {
      phases.push(snapshot.phase);
    });

    const ticket = controller.requestBuild({ rootFile: "main.tex" });
    await flushMicrotasks();
    adapter.complete(ticket.buildId, "succeeded");
    const completion = await ticket.completion;

    expect(completion.disposition).toBe("current");
    expect(phases).toEqual(["queued", "compiling", "succeeded", "idle"]);
    expect(controller.getSnapshot()).toMatchObject({
      phase: "idle",
      newestRequestedGeneration: 1,
      latestResult: {
        buildId: ticket.buildId,
        generation: 1,
        status: "succeeded",
      },
      visiblePdf: {
        buildId: ticket.buildId,
        generation: 1,
        isCurrent: true,
      },
    });
  });

  it.each(["failed", "timed-out"] as const)(
    "publishes the %s terminal transition",
    async (status) => {
      const adapter = new ControlledAdapter();
      const controller = createController(adapter);
      const phases: BuildPhase[] = [];
      controller.subscribe((snapshot) => {
        phases.push(snapshot.phase);
      });

      const ticket = controller.requestBuild({ rootFile: "main.tex" });
      await flushMicrotasks();
      adapter.complete(ticket.buildId, status);
      await ticket.completion;

      expect(phases).toEqual(["queued", "compiling", status, "idle"]);
      expect(controller.getSnapshot().latestResult?.status).toBe(status);
    },
  );

  it("cancels the active build through the adapter", async () => {
    const adapter = new ControlledAdapter();
    const controller = createController(adapter);
    const phases: BuildPhase[] = [];
    controller.subscribe((snapshot) => {
      phases.push(snapshot.phase);
    });

    const ticket = controller.requestBuild({ rootFile: "main.tex" });
    await flushMicrotasks();

    await expect(controller.cancelActiveBuild()).resolves.toBe(true);
    const completion = await ticket.completion;

    expect(completion.result?.status).toBe("cancelled");
    expect(phases).toEqual(["queued", "compiling", "cancelled", "idle"]);
    await expect(controller.cancelActiveBuild()).resolves.toBe(false);
  });

  it("debounces with fake timers before queueing the build", async () => {
    vi.useFakeTimers();
    const adapter = new ControlledAdapter();
    const controller = createController(adapter);
    const phases: BuildPhase[] = [];
    controller.subscribe((snapshot) => {
      phases.push(snapshot.phase);
    });

    const ticket = controller.requestBuild(
      { rootFile: "main.tex" },
      { debounceMs: 800 },
    );
    expect(controller.getSnapshot().phase).toBe("debouncing");

    await vi.advanceTimersByTimeAsync(799);
    expect(adapter.requests).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    await flushMicrotasks();
    expect(adapter.requests).toHaveLength(1);

    adapter.complete(ticket.buildId, "succeeded");
    await ticket.completion;
    expect(phases).toEqual([
      "debouncing",
      "queued",
      "compiling",
      "succeeded",
      "idle",
    ]);
  });

  it("replaces a debounced request and starts only the newest timer", async () => {
    vi.useFakeTimers();
    const adapter = new ControlledAdapter();
    const controller = createController(adapter);
    const first = controller.requestBuild(
      { rootFile: "main.tex" },
      { debounceMs: 800 },
    );
    const second = controller.requestBuild(
      { rootFile: "main.tex" },
      { debounceMs: 800 },
    );

    await expect(first.completion).resolves.toEqual({
      disposition: "superseded",
      result: null,
    });
    await vi.advanceTimersByTimeAsync(800);
    await flushMicrotasks();

    expect(adapter.requests.map((request) => request.buildId)).toEqual([
      second.buildId,
    ]);
    adapter.complete(second.buildId, "succeeded");
    await second.completion;
  });

  it("returns to debouncing when an active stale build finishes first", async () => {
    vi.useFakeTimers();
    const adapter = new ControlledAdapter();
    const controller = createController(adapter);
    const first = controller.requestBuild({ rootFile: "main.tex" });
    await flushMicrotasks();
    const second = controller.requestBuild(
      { rootFile: "main.tex" },
      { debounceMs: 800 },
    );

    adapter.complete(first.buildId, "succeeded");
    await first.completion;
    expect(controller.getSnapshot().phase).toBe("debouncing");
    expect(adapter.requests).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(800);
    await flushMicrotasks();
    expect(adapter.requests).toHaveLength(2);
    adapter.complete(second.buildId, "succeeded");
    await second.completion;
  });

  it("runs only the active and newest request during a rapid-request burst", async () => {
    const adapter = new ControlledAdapter();
    const controller = createController(adapter);
    const first = controller.requestBuild({ rootFile: "main.tex" });
    await flushMicrotasks();
    const burst = Array.from({ length: 50 }, () =>
      controller.requestBuild({ rootFile: "main.tex" }),
    );

    const superseded = await Promise.all(
      burst.slice(0, -1).map((ticket) => ticket.completion),
    );
    expect(
      superseded.every((completion) => completion.disposition === "superseded"),
    ).toBe(true);
    expect(adapter.requests).toHaveLength(1);

    adapter.complete(first.buildId, "succeeded");
    await expect(first.completion).resolves.toMatchObject({
      disposition: "stale",
      result: { generation: 1 },
    });
    await flushMicrotasks();
    expect(adapter.requests).toHaveLength(2);
    expect(controller.getSnapshot().lastSuccessfulBuild).toBeNull();

    const newest = burst.at(-1);
    if (newest === undefined) {
      throw new Error("Rapid-request fixture did not create a newest build.");
    }
    adapter.complete(newest.buildId, "succeeded");
    await expect(newest.completion).resolves.toMatchObject({
      disposition: "current",
      result: { generation: 51 },
    });

    expect(adapter.maxActiveCount).toBe(1);
    expect(adapter.requests.map((request) => request.generation)).toEqual([
      1, 51,
    ]);
    expect(controller.getSnapshot().lastSuccessfulBuild?.generation).toBe(51);
  });

  it("retains the last successful PDF metadata after a newer failure", async () => {
    const adapter = new ControlledAdapter();
    const controller = createController(adapter);
    const successful = controller.requestBuild({ rootFile: "main.tex" });
    await flushMicrotasks();
    adapter.complete(successful.buildId, "succeeded");
    await successful.completion;
    const retained = controller.getSnapshot().lastSuccessfulBuild;

    const failed = controller.requestBuild({ rootFile: "main.tex" });
    expect(controller.getSnapshot().visiblePdf?.isCurrent).toBe(false);
    await flushMicrotasks();
    adapter.complete(failed.buildId, "failed");
    await failed.completion;

    expect(controller.getSnapshot()).toMatchObject({
      latestResult: {
        buildId: failed.buildId,
        generation: 2,
        status: "failed",
      },
      lastSuccessfulBuild: retained,
      visiblePdf: {
        buildId: successful.buildId,
        generation: 1,
        isCurrent: false,
      },
    });
    expect(adapter.requests[0]?.buildDirectory).not.toBe(
      adapter.requests[1]?.buildDirectory,
    );
  });

  it("converts an adapter exception into a current failed result", async () => {
    const controller = createController(new ThrowingAdapter());
    const ticket = controller.requestBuild({ rootFile: "main.tex" });

    await expect(ticket.completion).resolves.toMatchObject({
      disposition: "current",
      result: {
        buildId: ticket.buildId,
        generation: 1,
        status: "failed",
        failureReason: "Fake adapter crash.",
      },
    });
    expect(controller.getSnapshot().phase).toBe("idle");
  });

  it("rejects a compiler result with a mismatched build identity", async () => {
    const controller = createController(new MismatchedAdapter());
    const ticket = controller.requestBuild({ rootFile: "main.tex" });

    await expect(ticket.completion).resolves.toMatchObject({
      disposition: "current",
      result: {
        buildId: ticket.buildId,
        generation: 1,
        status: "failed",
        failureReason:
          "Compiler adapter returned a result for a different build identity.",
      },
    });
    expect(controller.getSnapshot().lastSuccessfulBuild).toBeNull();
  });

  it("rejects invalid debounce and timeout values", () => {
    const adapter = new ControlledAdapter();
    expect(
      () =>
        new BuildController(adapter, {
          projectDirectory: "C:\\project",
          timeoutMs: 0,
        }),
    ).toThrow("greater than zero");

    const controller = createController(adapter);
    expect(() =>
      controller.requestBuild({ rootFile: "main.tex" }, { debounceMs: -1 }),
    ).toThrow("zero or greater");
    expect(() =>
      controller.requestBuild(
        { rootFile: "main.tex" },
        { debounceMs: Number.POSITIVE_INFINITY },
      ),
    ).toThrow("zero or greater");

    const invalidIdController = new BuildController(adapter, {
      projectDirectory: "C:\\project",
      idFactory: () => "..\\outside",
    });
    expect(() =>
      invalidIdController.requestBuild({ rootFile: "main.tex" }),
    ).toThrow("Build IDs must contain");
  });
});
