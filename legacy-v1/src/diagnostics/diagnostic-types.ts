export type DiagnosticSeverity = "error" | "warning" | "info";

export type DiagnosticSource =
  | "biber"
  | "bibtex"
  | "latex"
  | "latexmk"
  | "system";

export interface BuildDiagnostic {
  severity: DiagnosticSeverity;
  message: string;
  file: string | null;
  line: number | null;
  column: number | null;
  source: DiagnosticSource;
  rawExcerpt: string;
}
