#!/usr/bin/env node

import type { CompileRecipe } from "../compiler/compile-types.js";
import { MiktexCompilerAdapter } from "../compiler/compiler-adapter.js";
import { CliUsageError, parseArguments } from "./arguments.js";

const HELP = `Usage: texpulse-compile [options]

Options:
  --project <directory>     Project directory. Defaults to the current directory.
  --root <file>             Root TeX file. Defaults to main.tex.
  --outdir <directory>      Build directory inside the project. Defaults to .texpulse/build.
  --recipe <name>           pdf, xelatex, or lualatex. Defaults to pdf.
  --custom-bin <directory>  Prefer executables from this directory.
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

async function main(): Promise<void> {
  try {
    const parsed = parseArguments(
      process.argv.slice(2),
      new Set(["--project", "--root", "--outdir", "--recipe", "--custom-bin"]),
      new Set(["--help"]),
    );

    if (parsed.flags.has("--help")) {
      process.stdout.write(HELP);
      return;
    }

    const customBinDirectory = parsed.values.get("--custom-bin");
    const result = await new MiktexCompilerAdapter().compile({
      projectDirectory: parsed.values.get("--project") ?? process.cwd(),
      rootFile: parsed.values.get("--root") ?? "main.tex",
      buildDirectory: parsed.values.get("--outdir") ?? ".texpulse/build",
      recipe: parseRecipe(parsed.values.get("--recipe")),
      ...(customBinDirectory === undefined ? {} : { customBinDirectory }),
    });

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.status === "succeeded" ? 0 : 1;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected compile failure.";
    process.stderr.write(`${message}\n\n${HELP}`);
    process.exitCode = error instanceof CliUsageError ? 2 : 1;
  }
}

await main();
