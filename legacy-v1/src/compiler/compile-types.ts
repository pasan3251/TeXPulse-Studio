export type CompileRecipe = "pdf" | "xelatex" | "lualatex";
export type CompileStatus = "succeeded" | "failed" | "cancelled" | "timed-out";

export const DEFAULT_COMPILE_TIMEOUT_MS = 120_000;

export interface CompileRequest {
  buildId?: string;
  generation?: number;
  projectDirectory: string;
  rootFile: string;
  buildDirectory?: string;
  recipe?: CompileRecipe;
  customBinDirectory?: string;
  timeoutMs?: number;
  allowLatexmkRc?: boolean;
  clean?: boolean;
}

export interface CompileResult {
  buildId: string;
  generation: number;
  status: CompileStatus;
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
  outputTruncated: boolean;
  failureReason: string | null;
}
