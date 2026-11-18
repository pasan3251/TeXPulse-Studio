#!/usr/bin/env node

import { fileURLToPath } from "node:url";

import { CliUsageError, parseArguments } from "./arguments.js";
import { runDoctor } from "../toolchain/doctor.js";

const HELP = `Usage: texpulse-doctor [options]

Options:
  --custom-bin <directory>  Prefer executables from this directory.
  --skip-self-test          Explicitly skip the real compile self-test.
  --help                    Show this help.
`;

async function main(): Promise<void> {
  try {
    const parsed = parseArguments(
      process.argv.slice(2),
      new Set(["--custom-bin"]),
      new Set(["--skip-self-test", "--help"]),
    );

    if (parsed.flags.has("--help")) {
      process.stdout.write(HELP);
      return;
    }

    const customBinDirectory = parsed.values.get("--custom-bin");
    const report = await runDoctor({
      fixturePath: fileURLToPath(
        new URL("../../fixtures/minimal-success/main.tex", import.meta.url),
      ),
      skipSelfTest: parsed.flags.has("--skip-self-test"),
      ...(customBinDirectory === undefined ? {} : { customBinDirectory }),
    });

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = report.ready ? 0 : 1;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected doctor failure.";
    process.stderr.write(`${message}\n\n${HELP}`);
    process.exitCode = error instanceof CliUsageError ? 2 : 1;
  }
}

await main();
