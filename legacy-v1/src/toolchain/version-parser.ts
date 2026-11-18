import type { ToolId } from "./tool-specs.js";

function stripAnsi(input: string): string {
  let output = "";

  for (let index = 0; index < input.length; index += 1) {
    if (input.charCodeAt(index) !== 27 || input[index + 1] !== "[") {
      output += input[index];
      continue;
    }

    index += 2;
    while (index < input.length) {
      const code = input.charCodeAt(index);
      if (code >= 64 && code <= 126) {
        break;
      }
      index += 1;
    }
  }

  return output;
}

function cleanOutput(output: string): string {
  return stripAnsi(output).replaceAll("\r", "");
}

const VERSION_PATTERNS: Record<ToolId, RegExp> = {
  latexmk: /Latexmk[^\n]*Version\s+([^\s]+)/i,
  pdflatex: /MiKTeX-pdfTeX\s+([^\s]+)/i,
  xelatex: /MiKTeX-XeTeX\s+([^\s]+)/i,
  lualatex: /(?:LuaHBTeX|LuaTeX)[^\n]*Version\s+([^\s]+)/i,
  bibtex: /MiKTeX-BibTeX\s+([^\s]+)/i,
  biber: /biber version:\s*([^\s]+)/i,
  makeindex: /MakeIndex[^\n]*Version\s+([^\s]+)/i,
  synctex: /command-line client,\s*version\s+([^\s]+)/i,
};

export function parseToolVersion(
  tool: ToolId,
  stdout: string,
  stderr = "",
): string | null {
  const output = cleanOutput(`${stdout}\n${stderr}`);
  return VERSION_PATTERNS[tool].exec(output)?.[1] ?? null;
}

export function normalizeToolOutput(stdout: string, stderr: string): string {
  return cleanOutput(`${stdout}\n${stderr}`).trim();
}
