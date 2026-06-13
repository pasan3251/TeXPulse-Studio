import { mkdir, realpath } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { randomUUID } from "node:crypto";

import {
  NodeProcessRunner,
  type ProcessRunner,
} from "../process/process-runner.js";
import { environmentWithPrependedPath } from "../process/environment.js";
import { discoverExecutable } from "../toolchain/executable-discovery.js";
import {
  DEFAULT_COMPILE_TIMEOUT_MS,
  type CompileRequest,
  type CompileResult,
  type CompileStatus,
} from "./compile-types.js";
import { buildLatexmkArguments } from "./latexmk-arguments.js";
import { validateCompilePaths } from "./path-validation.js";

export interface ExecutableCommand {
  executable: string;
  prefixArgs?: readonly string[];
}

export interface MiktexCompilerDependencies {
  processRunner?: ProcessRunner;
  latexmkCommand?: ExecutableCommand;
  engineExecutable?: string | null;
}

function failedResult(
  buildId: string,
  generation: number,
  reason: string,
  startedAt: Date,
  status: CompileStatus = "failed",
): CompileResult {
  const endedAt = new Date();
  return {
    buildId,
    generation,
    status,
    exitCode: null,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: endedAt.getTime() - startedAt.getTime(),
    executable: null,
    args: [],
    projectDirectory: null,
    rootFile: null,
    buildDirectory: null,
    pdfPath: null,
    logPath: null,
    synctexPath: null,
    stdout: "",
    stderr: "",
    failureReason: reason,
  };
}

async function resolveLatexmkCommand(
  request: CompileRequest,
  dependency: ExecutableCommand | undefined,
): Promise<ExecutableCommand | null> {
  if (dependency !== undefined) {
    return dependency;
  }

  const executable = await discoverExecutable(
    "latexmk",
    request.customBinDirectory === undefined
      ? {}
      : { customBinDirectory: request.customBinDirectory },
  );

  return executable === null ? null : { executable };
}

const RECIPE_ENGINES = {
  pdf: "pdflatex",
  xelatex: "xelatex",
  lualatex: "lualatex",
} as const;

async function outputPathOrNull(path: string): Promise<string | null> {
  try {
    return await realpath(path);
  } catch {
    return null;
  }
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted ?? false;
}

export async function compileProject(
  request: CompileRequest,
  dependencies: MiktexCompilerDependencies = {},
  signal?: AbortSignal,
): Promise<CompileResult> {
  const buildId = request.buildId ?? randomUUID();
  const generation = request.generation ?? 1;
  const requestStartedAt = new Date();
  const recipe = request.recipe ?? "pdf";
  const requestedBuildDirectory = request.buildDirectory ?? ".texpulse/build";
  const timeoutMs = request.timeoutMs ?? DEFAULT_COMPILE_TIMEOUT_MS;
  let paths;

  if (!Number.isSafeInteger(generation) || generation < 1) {
    return failedResult(
      buildId,
      generation,
      "Build generation must be a positive safe integer.",
      requestStartedAt,
    );
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return failedResult(
      buildId,
      generation,
      "Compile timeout must be greater than zero milliseconds.",
      requestStartedAt,
    );
  }
  if (isAborted(signal)) {
    return failedResult(
      buildId,
      generation,
      "Build was cancelled before the compiler started.",
      requestStartedAt,
      "cancelled",
    );
  }

  try {
    paths = await validateCompilePaths(
      request.projectDirectory,
      request.rootFile,
      requestedBuildDirectory,
    );
  } catch (error) {
    return failedResult(
      buildId,
      generation,
      error instanceof Error
        ? error.message
        : "Compile path validation failed.",
      requestStartedAt,
    );
  }

  if (isAborted(signal)) {
    return failedResult(
      buildId,
      generation,
      "Build was cancelled before the compiler started.",
      requestStartedAt,
      "cancelled",
    );
  }

  const command = await resolveLatexmkCommand(
    request,
    dependencies.latexmkCommand,
  );
  if (command === null) {
    return failedResult(
      buildId,
      generation,
      "latexmk was not found. Install MiKTeX or provide --custom-bin.",
      requestStartedAt,
    );
  }
  const engineName = RECIPE_ENGINES[recipe];
  const engineExecutable =
    dependencies.engineExecutable === undefined
      ? await discoverExecutable(engineName, {
          ...(request.customBinDirectory === undefined
            ? {}
            : { customBinDirectory: request.customBinDirectory }),
        })
      : dependencies.engineExecutable;
  if (engineExecutable === null) {
    return failedResult(
      buildId,
      generation,
      `${engineName} was not found. Install the selected MiKTeX engine or provide --custom-bin.`,
      requestStartedAt,
    );
  }

  await mkdir(paths.buildDirectory, { recursive: true });
  const rootBaseName = basename(paths.rootFile, extname(paths.rootFile));
  const pdfPath = join(paths.buildDirectory, `${rootBaseName}.pdf`);
  const logPath = join(paths.buildDirectory, `${rootBaseName}.log`);
  const synctexPath = join(paths.buildDirectory, `${rootBaseName}.synctex.gz`);
  const latexmkArgs = buildLatexmkArguments({
    recipe,
    rootFile: paths.rootFile,
    buildDirectory: paths.buildDirectory,
  });
  const args = [...(command.prefixArgs ?? []), ...latexmkArgs];
  const processRunner = dependencies.processRunner ?? new NodeProcessRunner();
  const processResult = await processRunner.run({
    executable: command.executable,
    args,
    cwd: paths.projectDirectory,
    timeoutMs,
    ...(signal === undefined ? {} : { signal }),
    ...(request.customBinDirectory === undefined
      ? {}
      : {
          env: environmentWithPrependedPath(request.customBinDirectory),
        }),
  });

  const readablePdfPath = await outputPathOrNull(pdfPath);
  const readableLogPath = await outputPathOrNull(logPath);
  const readableSynctexPath = await outputPathOrNull(synctexPath);

  const succeeded =
    processResult.terminationReason === null &&
    processResult.error === null &&
    processResult.exitCode === 0 &&
    readablePdfPath !== null;
  const status: CompileStatus =
    processResult.terminationReason === "cancelled"
      ? "cancelled"
      : processResult.terminationReason === "timed-out"
        ? "timed-out"
        : succeeded
          ? "succeeded"
          : "failed";
  const terminationDetail =
    processResult.terminationError === null
      ? ""
      : ` Process cleanup reported: ${processResult.terminationError}`;
  const failureReason =
    status === "succeeded"
      ? null
      : status === "cancelled"
        ? `Build was cancelled.${terminationDetail}`
        : status === "timed-out"
          ? `Build exceeded the ${String(timeoutMs)} ms timeout.${terminationDetail}`
          : (processResult.error ??
            (processResult.exitCode !== 0
              ? `latexmk exited with code ${String(processResult.exitCode)}.`
              : "latexmk exited successfully but did not produce a readable PDF."));

  return {
    buildId,
    generation,
    status,
    exitCode: processResult.exitCode,
    startedAt: processResult.startedAt,
    endedAt: processResult.endedAt,
    durationMs: processResult.durationMs,
    executable: command.executable,
    args,
    projectDirectory: paths.projectDirectory,
    rootFile: paths.rootFile,
    buildDirectory: paths.buildDirectory,
    pdfPath: succeeded ? readablePdfPath : null,
    logPath: readableLogPath,
    synctexPath: readableSynctexPath,
    stdout: processResult.stdout,
    stderr: processResult.stderr,
    failureReason,
  };
}
