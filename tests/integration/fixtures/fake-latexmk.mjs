import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { createMinimalPdf } from "./minimal-pdf.mjs";

const args = process.argv.slice(2);
const outdirArgument = args.find((argument) => argument.startsWith("-outdir="));
const rootFile = args.at(-1);
const source =
  rootFile === undefined
    ? ""
    : await readFile(rootFile, "utf8").catch(() => "");
const includedPath = /\\input\{([^}]+)\}/u.exec(source)?.[1];
const includedSource =
  rootFile === undefined || includedPath === undefined
    ? ""
    : await readFile(
        join(
          dirname(rootFile),
          includedPath.endsWith(".tex") ? includedPath : `${includedPath}.tex`,
        ),
        "utf8",
      ).catch(() => "");
const startedAt = Date.now();
const delayMs = Number(process.env.TEXPULSE_FAKE_DELAY_MS ?? "0");
if (Number.isFinite(delayMs) && delayMs > 0) {
  await delay(delayMs);
}

if (
  outdirArgument !== undefined &&
  rootFile !== undefined &&
  (source.includes("TEXPULSE_DIAG_UNDEFINED") ||
    includedSource.includes("TEXPULSE_DIAG_UNDEFINED"))
) {
  const outputDirectory = outdirArgument.slice("-outdir=".length);
  const baseName = basename(rootFile, extname(rootFile));
  const diagnosticFile =
    includedSource.includes("TEXPULSE_DIAG_UNDEFINED") &&
    includedPath !== undefined
      ? includedPath.endsWith(".tex")
        ? includedPath
        : `${includedPath}.tex`
      : baseName + ".tex";
  const diagnosticSource =
    diagnosticFile === `${baseName}.tex` ? source : includedSource;
  const diagnosticLine =
    diagnosticSource
      .split(/\r?\n/u)
      .findIndex((line) => line.includes("TEXPULSE_DIAG_UNDEFINED")) + 1;
  const log =
    `(./${baseName}.tex\n` +
    (diagnosticFile === `${baseName}.tex` ? "" : `(./${diagnosticFile}\n`) +
    "! Undefined control sequence.\n" +
    `l.${String(diagnosticLine)} \\undefinedcommand\n` +
    (diagnosticFile === `${baseName}.tex` ? "" : ")\n") +
    ")\n";
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(join(outputDirectory, `${baseName}.log`), log);
  process.stderr.write(
    "Latexmk: Errors, so I did not complete making targets\n",
  );
  process.exitCode = 3;
} else if (
  args.includes("--fake-exit") ||
  source.includes("TEXPULSE_FAKE_FAIL")
) {
  process.stderr.write("Fake compiler failure.\n");
  process.exitCode = 3;
} else if (outdirArgument === undefined || rootFile === undefined) {
  process.stderr.write("Missing outdir or root file.\n");
  process.exitCode = 2;
} else {
  const outputDirectory = outdirArgument.slice("-outdir=".length);
  const baseName = basename(rootFile, extname(rootFile));
  await mkdir(outputDirectory, { recursive: true });
  if (!args.includes("--fake-no-pdf")) {
    await writeFile(
      join(outputDirectory, `${baseName}.pdf`),
      createMinimalPdf("TeXPulse Sprint 7"),
    );
  }
  await writeFile(
    join(outputDirectory, `${baseName}.log`),
    "fake latexmk log\n",
  );
  if (!args.includes("--fake-no-synctex")) {
    await writeFile(
      join(outputDirectory, `${baseName}.synctex.gz`),
      "fake synctex\n",
    );
  }
  process.stdout.write(
    JSON.stringify({ args, cwd: process.cwd(), path: process.env.PATH }),
  );
}

const tracePath = process.env.TEXPULSE_FAKE_TRACE;
if (tracePath !== undefined) {
  await appendFile(
    tracePath,
    `${JSON.stringify({
      source,
      startedAt,
      endedAt: Date.now(),
      status: process.exitCode === undefined ? "succeeded" : "failed",
    })}\n`,
  );
}
