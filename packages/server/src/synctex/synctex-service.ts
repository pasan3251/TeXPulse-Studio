import type { ForwardSyncTarget, InverseSyncTarget } from "@texpulse/shared";
import { NodeProcessRunner, type ProcessResult, type ProcessRunner } from "../compiler/process-runner.js";
import { parseForwardSyncOutput, parseInverseSyncOutput } from "./synctex-parser.js";

const SYNCTEX_TIMEOUT_MS = 5_000;

export class SynctexServiceError extends Error {
  constructor(
    readonly code: "synctex-failed" | "synctex-unavailable",
    message: string,
  ) {
    super(message);
    this.name = "SynctexServiceError";
  }
}

export interface SynctexServiceOptions {
  executable?: string | undefined;
  prefixArgs?: readonly string[] | undefined;
  processRunner?: ProcessRunner | undefined;
}

export class SynctexService {
  private readonly processRunner: ProcessRunner;
  private readonly executable: string;
  private readonly prefixArgs: readonly string[];

  constructor(options: SynctexServiceOptions = {}) {
    this.processRunner = options.processRunner ?? new NodeProcessRunner();
    this.executable = options.executable ?? "synctex";
    this.prefixArgs = options.prefixArgs ?? [];
  }

  async forward(input: {
    projectDirectory: string;
    sourcePath: string;
    line: number;
    column: number;
    pdfPath: string;
    buildDirectory: string;
  }): Promise<ForwardSyncTarget> {
    const result = await this.run(input.projectDirectory, [
      "view",
      "-i",
      `${String(input.line)}:${String(input.column)}:${input.sourcePath}`,
      "-o",
      input.pdfPath,
      "-d",
      input.buildDirectory,
    ]);
    const target = parseForwardSyncOutput(result.stdout);
    if (target === null) {
      throw new SynctexServiceError(
        "synctex-unavailable",
        "No SyncTeX location was found for the selected source position.",
      );
    }
    return target;
  }

  async inverse(input: {
    projectDirectory: string;
    page: number;
    x: number;
    y: number;
    pdfPath: string;
    buildDirectory: string;
    projectFiles: readonly string[];
  }): Promise<InverseSyncTarget> {
    const result = await this.run(input.projectDirectory, [
      "edit",
      "-o",
      `${String(input.page)}:${String(input.x)}:${String(input.y)}:${input.pdfPath}`,
      "-d",
      input.buildDirectory,
    ]);
    const target = parseInverseSyncOutput(result.stdout, input.projectFiles);
    if (target === null) {
      throw new SynctexServiceError(
        "synctex-unavailable",
        "No project source location was found for that PDF position.",
      );
    }
    return target;
  }

  private async run(
    projectDirectory: string,
    args: readonly string[],
  ): Promise<ProcessResult> {
    const env = { ...process.env };
    delete env.SYNCTEX_EDITOR;
    delete env.SYNCTEX_VIEWER;

    const result = await this.processRunner.run({
      executable: this.executable,
      args: [...this.prefixArgs, ...args],
      cwd: projectDirectory,
      env,
      timeoutMs: SYNCTEX_TIMEOUT_MS,
    });
    if (result.terminationReason === "timed-out") {
      throw new SynctexServiceError("synctex-failed", "SyncTeX navigation timed out.");
    }
    if (result.error !== null || result.exitCode !== 0) {
      throw new SynctexServiceError(
        "synctex-failed",
        "SyncTeX could not resolve the requested location.",
      );
    }
    return result;
  }
}
