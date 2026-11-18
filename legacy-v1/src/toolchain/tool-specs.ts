export type ToolId =
  | "latexmk"
  | "pdflatex"
  | "xelatex"
  | "lualatex"
  | "bibtex"
  | "biber"
  | "makeindex"
  | "synctex";

export interface ToolSpec {
  id: ToolId;
  label: string;
  executableName: string;
  versionArgs: readonly string[];
}

export const TOOL_SPECS: readonly ToolSpec[] = [
  {
    id: "latexmk",
    label: "latexmk",
    executableName: "latexmk",
    versionArgs: ["--version"],
  },
  {
    id: "pdflatex",
    label: "pdfLaTeX",
    executableName: "pdflatex",
    versionArgs: ["--version"],
  },
  {
    id: "xelatex",
    label: "XeLaTeX",
    executableName: "xelatex",
    versionArgs: ["--version"],
  },
  {
    id: "lualatex",
    label: "LuaLaTeX",
    executableName: "lualatex",
    versionArgs: ["--version"],
  },
  {
    id: "bibtex",
    label: "BibTeX",
    executableName: "bibtex",
    versionArgs: ["--version"],
  },
  {
    id: "biber",
    label: "Biber",
    executableName: "biber",
    versionArgs: ["--version"],
  },
  {
    id: "makeindex",
    label: "MakeIndex",
    executableName: "makeindex",
    versionArgs: ["-v"],
  },
  {
    id: "synctex",
    label: "SyncTeX",
    executableName: "synctex",
    versionArgs: ["--version"],
  },
] as const;
