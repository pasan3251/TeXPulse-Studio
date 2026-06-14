import { describe, expect, it } from "vitest";

import { buildLatexmkArguments } from "../../src/compiler/latexmk-arguments.js";

describe("buildLatexmkArguments", () => {
  it.each([
    ["pdf", "-pdf"],
    ["xelatex", "-xelatex"],
    ["lualatex", "-lualatex"],
  ] as const)("builds the %s recipe as an argument array", (recipe, flag) => {
    const args = buildLatexmkArguments({
      recipe,
      rootFile: "C:\\project with spaces\\main.tex",
      buildDirectory: "C:\\project with spaces\\.texpulse\\build",
    });

    expect(args).toContain(flag);
    expect(args).toContain("-norc");
    expect(args).toContain("-no-shell-escape");
    expect(args).toContain("-synctex=1");
    expect(args).toContain("-outdir=C:\\project with spaces\\.texpulse\\build");
    expect(args.at(-1)).toBe("C:\\project with spaces\\main.tex");
    expect(args.join(" ")).not.toContain("--shell-escape");
  });

  it("allows trusted rc files only by explicit option and forces clean make", () => {
    const args = buildLatexmkArguments({
      recipe: "pdf",
      rootFile: "main.tex",
      buildDirectory: ".texpulse/build",
      allowLatexmkRc: true,
      clean: true,
    });

    expect(args).not.toContain("-norc");
    expect(args).toContain("-gg");
    expect(args).toContain("-no-shell-escape");
  });
});
