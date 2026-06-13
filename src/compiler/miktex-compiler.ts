import { mkdir, realpath } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { randomUUID } from "node:crypto";

import {
  NodeProcessRunner,
  type ProcessRunner,
} from "../process/process-runner.js";
import { environmentWithPrependedPath } from "../process/environment.js";
import { discoverExecutable } from "../toolchain/executable-discovery.js";
import type { CompileRequest, CompileResult } from "./compile-types.js";
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
  reason: string,
  startedAt: Date,
): CompileResult {
  const endedAt = new Date();
  return {
    buildId,
    status: "failed",
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

export async function compileProject(
  request: CompileRequest,
  dependencies: MiktexCompilerDependencies = {},
): Promise<CompileResult> {
  const buildId = randomUUID();
  const requestStartedAt = new Date();
  const recipe = request.recipe ?? "pdf";
  const requestedBuildDirectory = request.buildDirectory ?? ".texpulse/build";
  let paths;

  try {
    paths = await validateCompilePaths(
      request.projectDirectory,
      request.rootFile,
      requestedBuildDirectory,
    );
  } catch (error) {
    return failedResult(
      buildId,
      error instanceof Error
        ? error.message
        : "Compile path validation failed.",
      requestStartedAt,
    );
  }

  const command = await resolveLatexmkCommand(
    request,
    dependencies.latexmkCommand,
  );
  if (command === null) {
    return failedResult(
      buildId,
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
    processResult.error === null &&
    processResult.exitCode === 0 &&
    readablePdfPath !== null;
  const failureReason = succeeded
    ? null
    : (processResult.error ??
      (processResult.exitCode !== 0
        ? `latexmk exited with code ${String(processResult.exitCode)}.`
        : "latexmk exited successfully but did not produce a readable PDF."));

  return {
    buildId,
    status: succeeded ? "succeeded" : "failed",
    exitCode: processResult.exitCode,
    startedAt: processResult.startedAt,
    endedAt: processResult.endedAt,
    durationMs: processResult.durationMs,
    executable: command.executable,
    args,
    projectDirectory: paths.projectDirectory,
    rootFile: paths.rootFile,
    buildDirectory: paths.buildDirectory,
    pdfPath: readablePdfPath,
    logPath: readableLogPath,
    synctexPath: readableSynctexPath,
    stdout: processResult.stdout,
    stderr: processResult.stderr,
    failureReason,
  };
}
