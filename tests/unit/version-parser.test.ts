import { describe, expect, it } from "vitest";

import {
  normalizeToolOutput,
  parseToolVersion,
} from "../../src/toolchain/version-parser.js";

describe("parseToolVersion", () => {
  it.each([
    ["latexmk", "Latexmk, John Collins. Version 4.88", "4.88"],
    ["pdflatex", "MiKTeX-pdfTeX 4.23 (MiKTeX 25.12)", "4.23"],
    ["xelatex", "MiKTeX-XeTeX 4.16 (MiKTeX 25.12)", "4.16"],
    ["lualatex", "This is LuaHBTeX, Version 1.24.0", "1.24.0"],
    ["bibtex", "MiKTeX-BibTeX 4.2", "4.2"],
    ["biber", "biber version: 2.21", "2.21"],
    [
      "synctex",
      "Synchronize TeXnology command-line client, version 1.21",
      "1.21",
    ],
  ] as const)("parses %s output", (tool, output, expected) => {
    expect(parseToolVersion(tool, output)).toBe(expected);
  });

  it("returns null for unsupported output", () => {
    expect(parseToolVersion("makeindex", "Usage: makeindex")).toBeNull();
  });

  it("removes ANSI sequences and Windows line endings", () => {
    expect(
      normalizeToolOutput(
        "\u001b[31;1mLatexmk Version 4.88\u001b[0m\r\n",
        "warning\r\n",
      ),
    ).toBe("Latexmk Version 4.88\n\nwarning");
  });

  it("parses a version reported on standard error", () => {
    expect(
      parseToolVersion(
        "synctex",
        "",
        "Synchronize TeXnology command-line client, version 1.21",
      ),
    ).toBe("1.21");
  });
});
