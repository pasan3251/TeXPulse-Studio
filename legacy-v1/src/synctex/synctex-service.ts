import type {
  ForwardSyncTarget,
  InverseSyncTarget,
} from "../ipc/synctex-contracts.js";
import {
  NodeProcessRunner,
  type ProcessResult,
  type ProcessRunner,
} from "../process/process-runner.js";
import { discoverExecutable } from "../toolchain/executable-discovery.js";
import {
  parseForwardSyncOutput,
  parseInverseSyncOutput,
} from "./synctex-parser.js";

const SYNCTEX_TIMEOUT_MS = 5_000;

export interface SynctexCommand {
  executable: string;
  prefixArgs?: readonly string[];
}

export type SynctexServiceErrorCode = "synctex-failed" | "synctex-unavailable";

export class SynctexServiceError extends Error {
  constructor(
    readonly code: SynctexServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SynctexServiceError";
  }
}

export interface SynctexServiceOptions {
  command?: SynctexCommand;
  processRunner?: ProcessRunner;
}

export class SynctexService {
  private readonly processRunner: ProcessRunner;

  constructor(private readonly options: SynctexServiceOptions = {}) {
    this.processRunner = options.processRunner ?? new NodeProcessRunner();
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
    const command = await this.resolveCommand();
    const env = { ...process.env };
    delete env.SYNCTEX_EDITOR;
    delete env.SYNCTEX_VIEWER;
    const result = await this.processRunner.run({
      executable: command.executable,
      args: [...(command.prefixArgs ?? []), ...args],
      cwd: projectDirectory,
      env,
      timeoutMs: SYNCTEX_TIMEOUT_MS,
    });
    if (result.terminationReason === "timed-out") {
      throw new SynctexServiceError(
        "synctex-failed",
        "SyncTeX navigation timed out.",
      );
    }
    if (result.error !== null || result.exitCode !== 0) {
      throw new SynctexServiceError(
        "synctex-failed",
        "SyncTeX could not resolve the requested location.",
      );
    }
    return result;
  }

  private async resolveCommand(): Promise<SynctexCommand> {
    if (this.options.command !== undefined) {
      return this.options.command;
    }
    const executable = await discoverExecutable("synctex");
    if (executable === null) {
      throw new SynctexServiceError(
        "synctex-unavailable",
        "SyncTeX is unavailable. Install it with MiKTeX and compile again.",
      );
    }
    return { executable };
  }
}
