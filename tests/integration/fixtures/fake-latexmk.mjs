import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

import { createMinimalPdf } from "./minimal-pdf.mjs";

const args = process.argv.slice(2);
const outdirArgument = args.find((argument) => argument.startsWith("-outdir="));
const rootFile = args.at(-1);
const source =
  rootFile === undefined
    ? ""
    : await readFile(rootFile, "utf8").catch(() => "");

if (args.includes("--fake-exit") || source.includes("TEXPULSE_FAKE_FAIL")) {
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
      createMinimalPdf("TeXPulse Sprint 5"),
    );
  }
  await writeFile(
    join(outputDirectory, `${baseName}.log`),
    "fake latexmk log\n",
  );
  await writeFile(
    join(outputDirectory, `${baseName}.synctex.gz`),
    "fake synctex\n",
  );
  process.stdout.write(
    JSON.stringify({ args, cwd: process.cwd(), path: process.env.PATH }),
  );
}
