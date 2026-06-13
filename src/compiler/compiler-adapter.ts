import { randomUUID } from "node:crypto";

import type { CompileRequest, CompileResult } from "./compile-types.js";
import {
  compileProject,
  type MiktexCompilerDependencies,
} from "./miktex-compiler.js";
import {
  probeToolchain,
  type ToolchainProbe,
} from "../toolchain/toolchain-probe.js";

export interface CompilerProbeOptions {
  customBinDirectory?: string;
}

export interface CompilerAdapter {
  probe(options?: CompilerProbeOptions): Promise<ToolchainProbe>;
  compile(request: CompileRequest): Promise<CompileResult>;
  cancel(buildId: string): Promise<boolean>;
}

export class MiktexCompilerAdapter implements CompilerAdapter {
  private readonly activeBuilds = new Map<string, AbortController>();

  constructor(private readonly dependencies: MiktexCompilerDependencies = {}) {}

  probe(options: CompilerProbeOptions = {}): Promise<ToolchainProbe> {
    return probeToolchain({
      ...(options.customBinDirectory === undefined
        ? {}
        : { customBinDirectory: options.customBinDirectory }),
      ...(this.dependencies.processRunner === undefined
        ? {}
        : { processRunner: this.dependencies.processRunner }),
    });
  }

  async compile(request: CompileRequest): Promise<CompileResult> {
    const buildId = request.buildId ?? randomUUID();
    const generation = request.generation ?? 1;
    if (this.activeBuilds.has(buildId)) {
      throw new Error(`Build ID is already active: ${buildId}`);
    }

    const abortController = new AbortController();
    this.activeBuilds.set(buildId, abortController);
    try {
      return await compileProject(
        {
          ...request,
          buildId,
          generation,
        },
        this.dependencies,
        abortController.signal,
      );
    } finally {
      this.activeBuilds.delete(buildId);
    }
  }

  cancel(buildId: string): Promise<boolean> {
    const activeBuild = this.activeBuilds.get(buildId);
    if (activeBuild === undefined) {
      return Promise.resolve(false);
    }

    activeBuild.abort();
    return Promise.resolve(true);
  }
}
