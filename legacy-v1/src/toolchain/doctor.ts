import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MiktexCompilerAdapter } from "../compiler/compiler-adapter.js";
import type { ExecutableCommand } from "../compiler/miktex-compiler.js";
import type { CompileResult } from "../compiler/compile-types.js";
import type { ProcessRunner } from "../process/process-runner.js";
import type { ToolchainProbe } from "./toolchain-probe.js";

export interface DoctorOptions {
  customBinDirectory?: string;
  skipSelfTest?: boolean;
  fixturePath: string;
  processRunner?: ProcessRunner;
  latexmkCommand?: ExecutableCommand;
}

export interface DoctorReport {
  ready: boolean;
  probe: ToolchainProbe;
  selfTest: {
    status: "passed" | "failed" | "skipped";
    message: string;
    result: CompileResult | null;
  };
}

export async function runDoctor(options: DoctorOptions): Promise<DoctorReport> {
  const adapter = new MiktexCompilerAdapter({
    ...(options.processRunner === undefined
      ? {}
      : { processRunner: options.processRunner }),
    ...(options.latexmkCommand === undefined
      ? {}
      : { latexmkCommand: options.latexmkCommand }),
  });
  const probe = await adapter.probe(
    options.customBinDirectory === undefined
      ? {}
      : { customBinDirectory: options.customBinDirectory },
  );

  if (options.skipSelfTest === true) {
    return {
      ready: probe.requiredToolsAvailable,
      probe,
      selfTest: {
        status: "skipped",
        message: "Real compile self-test was explicitly skipped.",
        result: null,
      },
    };
  }

  if (!probe.requiredToolsAvailable) {
    return {
      ready: false,
      probe,
      selfTest: {
        status: "failed",
        message:
          "Compile self-test was not run because required tools are unavailable.",
        result: null,
      },
    };
  }

  const temporaryProject = await mkdtemp(join(tmpdir(), "texpulse-doctor-"));
  try {
    await copyFile(options.fixturePath, join(temporaryProject, "main.tex"));
    const result = await adapter.compile({
      projectDirectory: temporaryProject,
      rootFile: "main.tex",
      ...(options.customBinDirectory === undefined
        ? {}
        : { customBinDirectory: options.customBinDirectory }),
    });

    return {
      ready: result.status === "succeeded",
      probe,
      selfTest: {
        status: result.status === "succeeded" ? "passed" : "failed",
        message:
          result.status === "succeeded"
            ? "Real compile self-test succeeded."
            : (result.failureReason ?? "Real compile self-test failed."),
        result,
      },
    };
  } finally {
    await rm(temporaryProject, { force: true, recursive: true });
  }
}
