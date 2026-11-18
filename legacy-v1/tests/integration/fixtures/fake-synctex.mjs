import { access, appendFile } from "node:fs/promises";
import { join } from "node:path";

const args = process.argv.slice(2);
const command = args[0];
const tracePath = process.env.TEXPULSE_FAKE_SYNCTEX_TRACE;

if (tracePath !== undefined) {
  await appendFile(
    tracePath,
    `${JSON.stringify({
      args,
      cwd: process.cwd(),
      editor: process.env.SYNCTEX_EDITOR ?? null,
      viewer: process.env.SYNCTEX_VIEWER ?? null,
    })}\n`,
  );
}

if (process.env.TEXPULSE_FAKE_SYNCTEX_FAIL === "1") {
  process.stderr.write("Fake SyncTeX failure.\n");
  process.exitCode = 2;
} else if (command === "view") {
  const output = valueAfter("-o") ?? "main.pdf";
  process.stdout.write(`SyncTeX result begin
Output:${output}
Page:1
x:72
y:108
h:70
v:110
W:180
H:16
before:
offset:-1
middle:
after:
SyncTeX result end
`);
} else if (command === "edit") {
  const included = join(process.cwd(), "chapters", "intro.tex");
  const input = (await exists(included))
    ? included.replaceAll("\\", "/")
    : join(process.cwd(), "main.tex").replaceAll("\\", "/");
  process.stdout.write(`SyncTeX result begin
Input:${input}
Line:${input.endsWith("/chapters/intro.tex") ? "2" : "3"}
Column:-1
Offset:0
Context:
SyncTeX result end
`);
} else {
  process.stderr.write("Unsupported fake SyncTeX command.\n");
  process.exitCode = 2;
}

function valueAfter(name) {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
