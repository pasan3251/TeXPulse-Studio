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
}

export class MiktexCompilerAdapter implements CompilerAdapter {
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

  compile(request: CompileRequest): Promise<CompileResult> {
    return compileProject(request, this.dependencies);
  }
}
