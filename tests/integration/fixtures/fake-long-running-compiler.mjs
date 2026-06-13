import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

const pidFileArgument = process.argv
  .slice(2)
  .find((argument) => argument.startsWith("--pid-file="));

if (pidFileArgument === undefined) {
  process.stderr.write("Missing --pid-file.\n");
  process.exitCode = 2;
} else {
  const child = spawn(
    process.execPath,
    ["-e", "setInterval(() => {}, 1_000);"],
    {
      shell: false,
      stdio: "ignore",
      windowsHide: true,
    },
  );
  await writeFile(
    pidFileArgument.slice("--pid-file=".length),
    JSON.stringify({
      parentPid: process.pid,
      childPid: child.pid,
    }),
  );
  setInterval(() => {}, 1_000);
}
