import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { basename, relative } from "node:path";

import { BuildController } from "../build/build-controller.js";
import type { BuildCompletion } from "../build/build-types.js";
import type { CompilerAdapter } from "../compiler/compiler-adapter.js";
import type { CompileRecipe } from "../compiler/compile-types.js";
import type {
  BuildView,
  PdfArtifact,
  PdfArtifactRequest,
} from "../ipc/build-contracts.js";
import type { OpenProjectResult } from "../ipc/project-contracts.js";
import type { ProjectFileChange } from "../ipc/project-contracts.js";
import { loadProjectMetadata } from "../project/project-metadata.js";
import {
  normalizeProjectPath,
  resolveProjectPath,
  toPortableProjectPath,
} from "../project/project-paths.js";
import { ProjectService } from "../project/project-service.js";
import { ProjectWatcher } from "../project/project-watcher.js";
import type { ProjectMetadata } from "../project/project-types.js";

const MAX_PDF_BYTES = 100 * 1024 * 1024;
const MAX_DISPLAY_LOG_CHARACTERS = 2 * 1024 * 1024;

type OpenProjectValue = Extract<OpenProjectResult, { ok: true }>["value"];

export type ProjectSessionErrorCode =
  | "artifact-stale"
  | "build-failed"
  | "external-open-failed"
  | "no-pdf"
  | "no-root"
  | "pdf-too-large";

export class ProjectSessionError extends Error {
  constructor(
    readonly code: ProjectSessionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProjectSessionError";
  }
}

export class ProjectSession {
  private constructor(
    private readonly service: ProjectService,
    private readonly controller: BuildController,
    private readonly metadata: ProjectMetadata,
    private readonly projectDescription: OpenProjectValue,
    private readonly watcher: ProjectWatcher | null,
  ) {}

  static async open(
    projectDirectory: string,
    adapter: CompilerAdapter,
    onFileChange?: (change: ProjectFileChange) => void,
  ): Promise<ProjectSession> {
    const service = await ProjectService.open(projectDirectory);
    const [entries, rootCandidates] = await Promise.all([
      service.listEntries(),
      service.detectRootFiles(),
    ]);
    const fallbackRoot = rootCandidates[0]?.path ?? null;
    const metadata = await loadProjectMetadata(service.root, fallbackRoot);
    const rootFile = metadata.metadata.rootFile ?? fallbackRoot;
    const projectId = createHash("sha256")
      .update(pathKey(service.root))
      .digest("hex")
      .slice(0, 16);
    const controller = new BuildController(adapter, {
      projectDirectory: service.root,
    });
    const watcher =
      onFileChange === undefined
        ? null
        : new ProjectWatcher({
            root: service.root,
            buildDirectory: metadata.metadata.buildDirectory,
            onChange: (change) => {
              onFileChange({ ...change, projectId });
            },
            onError: (error) => {
              console.error("Project file watcher failed.", error);
            },
            readVersion: async (path) =>
              (await service.readTextFile(path)).version,
          });

    return new ProjectSession(
      service,
      controller,
      metadata.metadata,
      {
        name: basename(service.root),
        projectId,
        entries,
        rootCandidates,
        rootFile,
        autoBuild: metadata.metadata.autoBuild,
      },
      watcher,
    );
  }

  describe(): OpenProjectValue {
    return this.projectDescription;
  }

  readTextFile(path: string) {
    return this.service.readTextFile(path);
  }

  async writeTextFile(path: string, content: string, expectedVersion: string) {
    const snapshot = await this.service.writeTextFile(
      path,
      content,
      expectedVersion,
    );
    this.watcher?.recordInternalWrite(snapshot.path, snapshot.version);
    return snapshot;
  }

  async compile(rootFile: string): Promise<BuildView> {
    const normalizedRoot = normalizeProjectPath(rootFile);
    if (!normalizedRoot.toLowerCase().endsWith(".tex")) {
      throw new ProjectSessionError(
        "no-root",
        "Select a LaTeX root file before compiling.",
      );
    }
    await this.service.readTextFile(normalizedRoot);

    const ticket = this.controller.requestBuild({
      rootFile: normalizedRoot,
      buildDirectory: this.metadata.buildDirectory,
      recipe: metadataRecipe(this.metadata.recipe),
    });
    const completion = await ticket.completion;
    return this.buildView(ticket.buildId, ticket.generation, completion);
  }

  cancelBuild(): Promise<boolean> {
    return this.controller.cancelActiveBuild();
  }

  async dispose(): Promise<void> {
    await this.cancelBuild();
    await this.watcher?.close();
  }

  async loadPdf(request: PdfArtifactRequest): Promise<{
    artifact: PdfArtifact;
    data: Uint8Array;
  }> {
    const resolved = await this.resolvePdf(request);
    const fileStat = await stat(resolved.path);
    if (!fileStat.isFile()) {
      throw new ProjectSessionError(
        "no-pdf",
        "The completed build PDF is no longer available.",
      );
    }
    if (fileStat.size > MAX_PDF_BYTES) {
      throw new ProjectSessionError(
        "pdf-too-large",
        `PDF preview is limited to ${String(MAX_PDF_BYTES)} bytes.`,
      );
    }
    return {
      artifact: resolved.artifact,
      data: new Uint8Array(await readFile(resolved.path)),
    };
  }

  async resolvePdf(request: PdfArtifactRequest): Promise<{
    artifact: PdfArtifact;
    path: string;
  }> {
    const snapshot = this.controller.getSnapshot();
    const visible = snapshot.visiblePdf;
    if (
      visible === null ||
      visible.buildId !== request.buildId ||
      visible.generation !== request.generation
    ) {
      throw new ProjectSessionError(
        "artifact-stale",
        "The requested PDF is no longer the visible build artifact.",
      );
    }

    const path = await this.safeGeneratedPath(visible.path);
    return {
      path,
      artifact: {
        buildId: visible.buildId,
        generation: visible.generation,
        fileName: basename(path),
        isCurrent: visible.isCurrent,
        completedAt:
          snapshot.lastSuccessfulBuild?.completedAt ??
          new Date(0).toISOString(),
      },
    };
  }

  private async buildView(
    buildId: string,
    generation: number,
    completion: BuildCompletion,
  ): Promise<BuildView> {
    const result = completion.result;
    if (result === null) {
      return {
        buildId,
        generation,
        disposition: completion.disposition,
        status: "superseded",
        durationMs: 0,
        failureReason: null,
        log: "",
        logTruncated: false,
        visiblePdf: this.visiblePdfArtifact(),
      };
    }

    const rawLog = await this.readDisplayLog(
      result.logPath,
      result.stdout,
      result.stderr,
    );
    return {
      buildId: result.buildId,
      generation: result.generation,
      disposition: completion.disposition,
      status: result.status,
      durationMs: result.durationMs,
      failureReason: result.failureReason,
      log: rawLog.text,
      logTruncated: rawLog.truncated,
      visiblePdf: this.visiblePdfArtifact(),
    };
  }

  private visiblePdfArtifact(): PdfArtifact | null {
    const snapshot = this.controller.getSnapshot();
    if (snapshot.visiblePdf === null || snapshot.lastSuccessfulBuild === null) {
      return null;
    }
    return {
      buildId: snapshot.visiblePdf.buildId,
      generation: snapshot.visiblePdf.generation,
      fileName: basename(snapshot.visiblePdf.path),
      isCurrent: snapshot.visiblePdf.isCurrent,
      completedAt: snapshot.lastSuccessfulBuild.completedAt,
    };
  }

  private async readDisplayLog(
    logPath: string | null,
    stdout: string,
    stderr: string,
  ): Promise<{ text: string; truncated: boolean }> {
    const sections: string[] = [];
    if (logPath !== null) {
      try {
        sections.push(
          await readFile(await this.safeGeneratedPath(logPath), "utf8"),
        );
      } catch (error) {
        sections.push(
          `The build log could not be read: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );
      }
    }
    if (stdout.trim() !== "") {
      sections.push(`--- stdout ---\n${stdout}`);
    }
    if (stderr.trim() !== "") {
      sections.push(`--- stderr ---\n${stderr}`);
    }

    const text = sections.join("\n\n");
    if (text.length <= MAX_DISPLAY_LOG_CHARACTERS) {
      return { text, truncated: false };
    }
    return {
      text: `${text.slice(0, MAX_DISPLAY_LOG_CHARACTERS)}\n\n[Display truncated. The full log remains in the build directory.]`,
      truncated: true,
    };
  }

  private async safeGeneratedPath(candidate: string): Promise<string> {
    const canonicalCandidate = await realpath(candidate);
    const projectPath = toPortableProjectPath(
      relative(this.service.root, canonicalCandidate),
    );
    const normalized = normalizeProjectPath(projectPath);
    const buildPrefix = pathKey(
      `${normalizeProjectPath(this.metadata.buildDirectory)}/generations/`,
    );
    if (!pathKey(normalized).startsWith(buildPrefix)) {
      throw new ProjectSessionError(
        "build-failed",
        "Compiler output was outside the configured generation directory.",
      );
    }
    const resolved = await resolveProjectPath(this.service.root, normalized);
    if (pathKey(resolved) !== pathKey(canonicalCandidate)) {
      throw new ProjectSessionError(
        "build-failed",
        "Compiler output did not resolve to the validated project artifact.",
      );
    }
    return resolved;
  }
}

function metadataRecipe(recipe: ProjectMetadata["recipe"]): CompileRecipe {
  switch (recipe) {
    case "latexmk-lualatex":
      return "lualatex";
    case "latexmk-xelatex":
      return "xelatex";
    case "latexmk-pdf":
      return "pdf";
  }
}

function pathKey(path: string): string {
  return process.platform === "win32" ? path.toLocaleLowerCase("en-US") : path;
}
