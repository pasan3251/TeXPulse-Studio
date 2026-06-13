import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

const args = process.argv.slice(2);
const outdirArgument = args.find((argument) => argument.startsWith("-outdir="));
const rootFile = args.at(-1);

if (args.includes("--fake-exit")) {
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
      "%PDF-1.4\n%%EOF\n",
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
