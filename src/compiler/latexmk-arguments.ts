import type { CompileRecipe } from "./compile-types.js";

const RECIPE_ARGUMENTS: Record<CompileRecipe, string> = {
  pdf: "-pdf",
  xelatex: "-xelatex",
  lualatex: "-lualatex",
};

export interface LatexmkArgumentOptions {
  recipe: CompileRecipe;
  rootFile: string;
  buildDirectory: string;
  allowLatexmkRc?: boolean;
  clean?: boolean;
}

export function buildLatexmkArguments(
  options: LatexmkArgumentOptions,
): readonly string[] {
  return [
    ...(options.allowLatexmkRc === true ? [] : ["-norc"]),
    "-no-shell-escape",
    ...(options.clean === true ? ["-gg"] : []),
    RECIPE_ARGUMENTS[options.recipe],
    "-synctex=1",
    "-interaction=nonstopmode",
    "-file-line-error",
    "-halt-on-error",
    `-outdir=${options.buildDirectory}`,
    options.rootFile,
  ];
}
