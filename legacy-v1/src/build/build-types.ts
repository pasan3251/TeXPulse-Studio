import type {
  CompileRecipe,
  CompileResult,
  CompileStatus,
} from "../compiler/compile-types.js";

export type BuildPhase =
  | "idle"
  | "debouncing"
  | "queued"
  | "compiling"
  | CompileStatus;

export interface BuildInput {
  rootFile: string;
  buildDirectory?: string;
  recipe?: CompileRecipe;
  customBinDirectory?: string;
  timeoutMs?: number;
  allowLatexmkRc?: boolean;
  clean?: boolean;
}

export interface BuildRequestOptions {
  debounceMs?: number;
}

export type BuildDisposition = "current" | "stale" | "superseded";

export interface BuildCompletion {
  disposition: BuildDisposition;
  result: CompileResult | null;
}

export interface BuildTicket {
  buildId: string;
  generation: number;
  completion: Promise<BuildCompletion>;
}

export interface LastSuccessfulBuild {
  buildId: string;
  generation: number;
  pdfPath: string;
  logPath: string | null;
  synctexPath: string | null;
  completedAt: string;
}

export interface VisiblePdf {
  buildId: string;
  generation: number;
  path: string;
  isCurrent: boolean;
}

export interface BuildControllerSnapshot {
  phase: BuildPhase;
  newestRequestedGeneration: number;
  activeBuildId: string | null;
  activeGeneration: number | null;
  queuedBuildId: string | null;
  queuedGeneration: number | null;
  latestResult: CompileResult | null;
  lastSuccessfulBuild: LastSuccessfulBuild | null;
  visiblePdf: VisiblePdf | null;
}
