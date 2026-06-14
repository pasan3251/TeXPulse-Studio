import { randomUUID } from "node:crypto";
import { join } from "node:path";

import type { CompilerAdapter } from "../compiler/compiler-adapter.js";
import {
  DEFAULT_COMPILE_TIMEOUT_MS,
  type CompileRequest,
  type CompileResult,
} from "../compiler/compile-types.js";
import type {
  BuildCompletion,
  BuildControllerSnapshot,
  BuildInput,
  BuildPhase,
  BuildRequestOptions,
  BuildTicket,
  LastSuccessfulBuild,
  VisiblePdf,
} from "./build-types.js";

interface PendingBuild {
  buildId: string;
  generation: number;
  input: BuildInput;
  ready: boolean;
  timeout: NodeJS.Timeout | null;
  resolve: (completion: BuildCompletion) => void;
}

export interface BuildControllerOptions {
  projectDirectory: string;
  timeoutMs?: number;
  idFactory?: () => string;
}

export type BuildStateListener = (snapshot: BuildControllerSnapshot) => void;

export class BuildController {
  private readonly projectDirectory: string;
  private readonly timeoutMs: number;
  private readonly idFactory: () => string;
  private readonly listeners = new Set<BuildStateListener>();
  private phase: BuildPhase = "idle";
  private newestRequestedGeneration = 0;
  private activeBuild: PendingBuild | null = null;
  private pendingBuild: PendingBuild | null = null;
  private latestResult: CompileResult | null = null;
  private lastSuccessfulBuild: LastSuccessfulBuild | null = null;

  constructor(
    private readonly adapter: CompilerAdapter,
    options: BuildControllerOptions,
  ) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_COMPILE_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error("Build timeout must be greater than zero milliseconds.");
    }

    this.projectDirectory = options.projectDirectory;
    this.timeoutMs = timeoutMs;
    this.idFactory = options.idFactory ?? randomUUID;
  }

  subscribe(listener: BuildStateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): BuildControllerSnapshot {
    const visiblePdf = this.visiblePdf();
    return {
      phase: this.phase,
      newestRequestedGeneration: this.newestRequestedGeneration,
      activeBuildId: this.activeBuild?.buildId ?? null,
      activeGeneration: this.activeBuild?.generation ?? null,
      queuedBuildId: this.pendingBuild?.buildId ?? null,
      queuedGeneration: this.pendingBuild?.generation ?? null,
      latestResult: this.latestResult,
      lastSuccessfulBuild: this.lastSuccessfulBuild,
      visiblePdf,
    };
  }

  requestBuild(
    input: BuildInput,
    options: BuildRequestOptions = {},
  ): BuildTicket {
    const debounceMs = options.debounceMs ?? 0;
    if (!Number.isFinite(debounceMs) || debounceMs < 0) {
      throw new Error("Build debounce must be zero or greater.");
    }

    this.newestRequestedGeneration += 1;
    const generation = this.newestRequestedGeneration;
    const buildId = this.idFactory();
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(buildId)) {
      throw new Error(
        "Build IDs must contain only letters, numbers, underscores, and hyphens.",
      );
    }
    let resolveCompletion!: (completion: BuildCompletion) => void;
    const completion = new Promise<BuildCompletion>((resolve) => {
      resolveCompletion = resolve;
    });
    const pendingBuild: PendingBuild = {
      buildId,
      generation,
      input,
      ready: debounceMs === 0,
      timeout: null,
      resolve: resolveCompletion,
    };

    this.replacePendingBuild(pendingBuild);
    if (debounceMs > 0) {
      pendingBuild.timeout = setTimeout(() => {
        if (this.pendingBuild !== pendingBuild) {
          return;
        }
        pendingBuild.timeout = null;
        pendingBuild.ready = true;
        this.queuePendingBuild();
      }, debounceMs);
      if (this.activeBuild === null) {
        this.setPhase("debouncing");
      } else {
        this.publish();
      }
    } else {
      this.queuePendingBuild();
    }

    return { buildId, generation, completion };
  }

  cancelActiveBuild(): Promise<boolean> {
    if (this.activeBuild === null) {
      return Promise.resolve(false);
    }

    return this.adapter.cancel(this.activeBuild.buildId);
  }

  private replacePendingBuild(pendingBuild: PendingBuild): void {
    if (this.pendingBuild !== null) {
      if (this.pendingBuild.timeout !== null) {
        clearTimeout(this.pendingBuild.timeout);
      }
      this.pendingBuild.resolve({
        disposition: "superseded",
        result: null,
      });
    }
    this.pendingBuild = pendingBuild;
  }

  private queuePendingBuild(): void {
    if (this.activeBuild !== null || this.pendingBuild?.ready !== true) {
      this.publish();
      return;
    }

    const nextBuild = this.pendingBuild;
    this.pendingBuild = null;
    this.activeBuild = nextBuild;
    this.setPhase("queued");
    queueMicrotask(() => {
      if (this.activeBuild === nextBuild) {
        void this.runActiveBuild(nextBuild);
      }
    });
  }

  private async runActiveBuild(activeBuild: PendingBuild): Promise<void> {
    this.setPhase("compiling");
    const baseBuildDirectory =
      activeBuild.input.buildDirectory ?? ".texpulse/build";
    const generationBuildDirectory = join(
      baseBuildDirectory,
      "generations",
      `${String(activeBuild.generation)}-${activeBuild.buildId}`,
    );
    const request: CompileRequest = {
      ...activeBuild.input,
      buildId: activeBuild.buildId,
      generation: activeBuild.generation,
      projectDirectory: this.projectDirectory,
      buildDirectory: generationBuildDirectory,
      timeoutMs: activeBuild.input.timeoutMs ?? this.timeoutMs,
    };
    let result: CompileResult;

    try {
      result = await this.adapter.compile(request);
    } catch (error) {
      const endedAt = new Date();
      result = {
        buildId: activeBuild.buildId,
        generation: activeBuild.generation,
        status: "failed",
        exitCode: null,
        startedAt: endedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationMs: 0,
        executable: null,
        args: [],
        projectDirectory: this.projectDirectory,
        rootFile: null,
        buildDirectory: null,
        pdfPath: null,
        logPath: null,
        synctexPath: null,
        stdout: "",
        stderr: "",
        outputTruncated: false,
        failureReason:
          error instanceof Error
            ? error.message
            : "Compiler adapter failed unexpectedly.",
      };
    }
    if (
      result.buildId !== activeBuild.buildId ||
      result.generation !== activeBuild.generation
    ) {
      const endedAt = new Date();
      result = {
        buildId: activeBuild.buildId,
        generation: activeBuild.generation,
        status: "failed",
        exitCode: null,
        startedAt: endedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationMs: 0,
        executable: null,
        args: [],
        projectDirectory: this.projectDirectory,
        rootFile: null,
        buildDirectory: null,
        pdfPath: null,
        logPath: null,
        synctexPath: null,
        stdout: "",
        stderr: "",
        outputTruncated: false,
        failureReason:
          "Compiler adapter returned a result for a different build identity.",
      };
    }

    this.activeBuild = null;
    const disposition =
      result.generation === this.newestRequestedGeneration
        ? "current"
        : "stale";

    if (disposition === "current") {
      this.latestResult = result;
      if (result.status === "succeeded" && result.pdfPath !== null) {
        this.lastSuccessfulBuild = {
          buildId: result.buildId,
          generation: result.generation,
          pdfPath: result.pdfPath,
          logPath: result.logPath,
          synctexPath: result.synctexPath,
          completedAt: result.endedAt,
        };
      }
    }

    activeBuild.resolve({ disposition, result });

    if (this.pendingBuild !== null) {
      if (this.pendingBuild.ready) {
        this.queuePendingBuild();
      } else {
        this.setPhase("debouncing");
      }
      return;
    }

    if (disposition === "current") {
      this.setPhase(result.status);
    }
    this.setPhase("idle");
  }

  private visiblePdf(): VisiblePdf | null {
    if (this.lastSuccessfulBuild === null) {
      return null;
    }

    return {
      buildId: this.lastSuccessfulBuild.buildId,
      generation: this.lastSuccessfulBuild.generation,
      path: this.lastSuccessfulBuild.pdfPath,
      isCurrent:
        this.lastSuccessfulBuild.generation ===
          this.newestRequestedGeneration &&
        this.latestResult?.status === "succeeded",
    };
  }

  private setPhase(phase: BuildPhase): void {
    this.phase = phase;
    this.publish();
  }

  private publish(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
