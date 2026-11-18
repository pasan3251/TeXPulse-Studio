#!/usr/bin/env node

import type { CompileRecipe } from "../compiler/compile-types.js";
import { MiktexCompilerAdapter } from "../compiler/compiler-adapter.js";
import { BuildController } from "../build/build-controller.js";
import { CliUsageError, parseArguments } from "./arguments.js";

const HELP = `Usage: texpulse-compile [options]

Options:
  --project <directory>     Project directory. Defaults to the current directory.
  --root <file>             Root TeX file. Defaults to main.tex.
  --outdir <directory>      Build directory inside the project. Defaults to .texpulse/build.
  --recipe <name>           pdf, xelatex, or lualatex. Defaults to pdf.
  --custom-bin <directory>  Prefer executables from this directory.
  --timeout <milliseconds>  Compiler timeout. Defaults to 120000.
  --help                    Show this help.
`;

function parseRecipe(value: string | undefined): CompileRecipe {
  if (value === undefined) {
    return "pdf";
  }
  if (value === "pdf" || value === "xelatex" || value === "lualatex") {
    return value;
  }

  throw new CliUsageError(`Unsupported recipe: ${value}`);
}

function parseTimeout(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const timeoutMs = Number(value);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new CliUsageError("--timeout must be a positive integer.");
  }
  return timeoutMs;
}

async function main(): Promise<void> {
  try {
    const parsed = parseArguments(
      process.argv.slice(2),
      new Set([
        "--project",
        "--root",
        "--outdir",
        "--recipe",
        "--custom-bin",
        "--timeout",
      ]),
      new Set(["--help"]),
    );

    if (parsed.flags.has("--help")) {
      process.stdout.write(HELP);
      return;
    }

    const customBinDirectory = parsed.values.get("--custom-bin");
    const adapter = new MiktexCompilerAdapter();
    const timeoutMs = parseTimeout(parsed.values.get("--timeout"));
    const controller = new BuildController(adapter, {
      projectDirectory: parsed.values.get("--project") ?? process.cwd(),
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    });
    let interrupted = false;
    const handleInterrupt = (): void => {
      interrupted = true;
      void controller.cancelActiveBuild();
    };
    process.once("SIGINT", handleInterrupt);
    const ticket = controller.requestBuild({
      rootFile: parsed.values.get("--root") ?? "main.tex",
      buildDirectory: parsed.values.get("--outdir") ?? ".texpulse/build",
      recipe: parseRecipe(parsed.values.get("--recipe")),
      ...(customBinDirectory === undefined ? {} : { customBinDirectory }),
    });
    const completion = await ticket.completion;
    process.removeListener("SIGINT", handleInterrupt);
    if (completion.result === null) {
      throw new Error("The requested build was superseded before it started.");
    }
    const result = completion.result;

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode =
      result.status === "succeeded"
        ? 0
        : result.status === "cancelled" || interrupted
          ? 130
          : result.status === "timed-out"
            ? 124
            : 1;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected compile failure.";
    process.stderr.write(`${message}\n\n${HELP}`);
    process.exitCode = error instanceof CliUsageError ? 2 : 1;
  }
}

await main();
