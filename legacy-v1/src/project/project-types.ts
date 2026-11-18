export type ProjectErrorCode =
  | "already-exists"
  | "binary-file"
  | "conflict"
  | "invalid-metadata"
  | "invalid-path"
  | "link-not-allowed"
  | "not-directory"
  | "not-file"
  | "not-found"
  | "path-escape"
  | "read-only";

export class ProjectError extends Error {
  constructor(
    readonly code: ProjectErrorCode,
    message: string,
    readonly projectPath: string | null = null,
  ) {
    super(message);
    this.name = "ProjectError";
  }
}

export type ProjectEntryKind = "directory" | "file" | "link";

export interface ProjectEntry {
  path: string;
  kind: ProjectEntryKind;
  size: number;
  modifiedAt: string;
}

export interface TextFileSnapshot {
  path: string;
  content: string;
  version: string;
  size: number;
  modifiedAt: string;
}

export type ExternalFileState = "changed" | "current" | "deleted";

export interface RootCandidate {
  path: string;
  score: number;
  reasons: string[];
}

export type CompileRecipe =
  | "latexmk-lualatex"
  | "latexmk-pdf"
  | "latexmk-xelatex";

export interface ProjectMetadata {
  schemaVersion: 2;
  rootFile: string | null;
  recipe: CompileRecipe;
  buildDirectory: string;
  autoBuild: boolean;
  allowLatexmkRc: boolean;
}

export interface MetadataLoadResult {
  metadata: ProjectMetadata;
  issues: string[];
  source: "default" | "file";
}

export interface RecentProject {
  path: string;
  lastOpenedAt: string;
}

export interface RecentProjectsLoadResult {
  projects: RecentProject[];
  issues: string[];
}
