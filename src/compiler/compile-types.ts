export type CompileRecipe = "pdf" | "xelatex" | "lualatex";

export interface CompileRequest {
  projectDirectory: string;
  rootFile: string;
  buildDirectory?: string;
  recipe?: CompileRecipe;
  customBinDirectory?: string;
}

export interface CompileResult {
  buildId: string;
  status: "succeeded" | "failed";
  exitCode: number | null;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  executable: string | null;
  args: readonly string[];
  projectDirectory: string | null;
  rootFile: string | null;
  buildDirectory: string | null;
  pdfPath: string | null;
  logPath: string | null;
  synctexPath: string | null;
  stdout: string;
  stderr: string;
  failureReason: string | null;
}
