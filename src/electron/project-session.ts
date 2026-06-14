import { createHash } from "node:crypto";
import { open, readFile, realpath, stat } from "node:fs/promises";
import { basename, dirname, relative } from "node:path";

import { BuildController } from "../build/build-controller.js";
import type { BuildCompletion } from "../build/build-types.js";
import type { CompilerAdapter } from "../compiler/compiler-adapter.js";
import type { CompileRecipe } from "../compiler/compile-types.js";
import { cleanupAuxiliaryFiles } from "../compiler/auxiliary-cleanup.js";
import { pruneGenerationDirectories } from "../compiler/generation-retention.js";
import { parseBuildDiagnostics } from "../diagnostics/diagnostic-parser.js";
import type {
  BuildView,
  PdfArtifact,
  PdfArtifactRequest,
} from "../ipc/build-contracts.js";
import type { OpenProjectResult } from "../ipc/project-contracts.js";
import type { ProjectFileChange } from "../ipc/project-contracts.js";
import {
  loadProjectMetadata,
  saveProjectMetadata,
} from "../project/project-metadata.js";
import {
  normalizeProjectPath,
  resolveProjectPath,
  toPortableProjectPath,
} from "../project/project-paths.js";
import { ProjectService } from "../project/project-service.js";
import { ProjectWatcher } from "../project/project-watcher.js";
import type { ProjectMetadata } from "../project/project-types.js";
import { exportProjectZip } from "../project/zip-export.js";
import type { ProjectZipSummary } from "../project/zip-export.js";
import { defaultGlobalSettings } from "../settings/settings-types.js";
import type { GlobalSettings } from "../settings/settings-types.js";
import type { ProjectSettings } from "../settings/project-settings.js";
import {
  SynctexService,
  SynctexServiceError,
} from "../synctex/synctex-service.js";
import type {
  ForwardSyncRequest,
  ForwardSyncTarget,
  InverseSyncRequest,
  InverseSyncTarget,
} from "../ipc/synctex-contracts.js";

const MAX_PDF_BYTES = 100 * 1024 * 1024;
const MAX_DISPLAY_LOG_CHARACTERS = 2 * 1024 * 1024;
const DISPLAY_TRUNCATION_NOTICE =
  "\n\n[Display truncated. The full bounded build log remains in the build directory.]";

type OpenProjectValue = Extract<OpenProjectResult, { ok: true }>["value"];

export type ProjectSessionErrorCode =
  | "artifact-stale"
  | "build-failed"
  | "cleanup-busy"
  | "external-open-failed"
  | "no-pdf"
  | "no-root"
  | "pdf-too-large"
  | "synctex-failed"
  | "synctex-stale"
  | "synctex-unavailable";

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
  private maintenanceActive = false;

  private constructor(
    private readonly service: ProjectService,
    private readonly controller: BuildController,
    private metadata: ProjectMetadata,
    private readonly projectDescription: OpenProjectValue,
    private watcher: ProjectWatcher | null,
    private readonly synctex: SynctexService,
    private readonly onFileChange:
      | ((change: ProjectFileChange) => void)
      | undefined,
    private readonly getGlobalSettings: () => Promise<GlobalSettings>,
  ) {}

  static async open(
    projectDirectory: string,
    adapter: CompilerAdapter,
    onFileChange?: (change: ProjectFileChange) => void,
    synctex: SynctexService = new SynctexService(),
    getGlobalSettings: () => Promise<GlobalSettings> = () =>
      Promise.resolve(defaultGlobalSettings()),
  ): Promise<ProjectSession> {
    const service = await ProjectService.open(projectDirectory);
    const [entries, rootCandidates] = await Promise.all([
      service.listEntries(),
      service.detectRootFiles(),
    ]);
    const fallbackRoot = rootCandidates[0]?.path ?? null;
    const [metadata, globalSettings] = await Promise.all([
      loadProjectMetadata(service.root, fallbackRoot),
      getGlobalSettings(),
    ]);
    if (metadata.source === "default") {
      metadata.metadata.autoBuild = globalSettings.autoBuild;
    }
    const configuredRoot = metadata.metadata.rootFile;
    const configuredRootExists =
      configuredRoot !== null &&
      entries.some(
        (entry) => entry.kind === "file" && entry.path === configuredRoot,
      );
    const rootFile = configuredRootExists ? configuredRoot : fallbackRoot;
    if (configuredRoot !== null && !configuredRootExists) {
      metadata.issues.push(
        `Configured root file was unavailable: ${configuredRoot}.`,
      );
      metadata.metadata.rootFile = rootFile;
    }
    const projectId = createHash("sha256")
      .update(pathKey(service.root))
      .digest("hex")
      .slice(0, 16);
    const controller = new BuildController(adapter, {
      projectDirectory: service.root,
    });
    const session = new ProjectSession(
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
        settings: toProjectSettings(metadata.metadata),
        settingsIssues: metadata.issues,
      },
      null,
      synctex,
      onFileChange,
      getGlobalSettings,
    );
    session.watcher = session.createWatcher();
    return session;
  }

  describe(): OpenProjectValue {
    return this.projectDescription;
  }

  supportRedactionPaths(): string[] {
    return [this.service.root];
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

  createDirectory(path: string): Promise<OpenProjectValue> {
    return this.mutateProject(() => this.service.createDirectory(path));
  }

  createTextFile(path: string, content: string): Promise<OpenProjectValue> {
    return this.mutateProject(() =>
      this.service.createTextFile(path, content).then(() => undefined),
    );
  }

  renameEntry(
    sourcePath: string,
    destinationPath: string,
    expectedVersion?: string,
  ): Promise<OpenProjectValue> {
    const source = normalizeProjectPath(sourcePath);
    const destination = normalizeProjectPath(destinationPath);
    return this.mutateProject(async () => {
      await this.service.renameEntry(source, destination, expectedVersion);
      const rootFile = this.metadata.rootFile;
      if (
        rootFile !== null &&
        (rootFile === source || rootFile.startsWith(`${source}/`))
      ) {
        this.metadata = {
          ...this.metadata,
          rootFile: `${destination}${rootFile.slice(source.length)}`,
        };
        await saveProjectMetadata(this.service.root, this.metadata);
      }
    });
  }

  deleteEntry(
    path: string,
    recursive: boolean,
    expectedVersion?: string,
  ): Promise<OpenProjectValue> {
    return this.mutateProject(() =>
      this.service.deleteEntry(path, {
        recursive,
        ...(expectedVersion === undefined ? {} : { expectedVersion }),
      }),
    );
  }

  async exportProject(destinationPath: string): Promise<ProjectZipSummary> {
    this.assertBuildIdle(
      "Wait for the current build to finish or cancel it before exporting the project.",
    );
    this.maintenanceActive = true;
    try {
      return await exportProjectZip(this.service.root, destinationPath);
    } finally {
      this.maintenanceActive = false;
    }
  }

  async compile(rootFile: string): Promise<BuildView> {
    return this.compileWithOptions(rootFile, false);
  }

  async cleanBuild(rootFile: string): Promise<BuildView> {
    return this.compileWithOptions(rootFile, true);
  }

  async updateProjectSettings(
    settings: ProjectSettings,
  ): Promise<ProjectSettings> {
    this.assertBuildIdle(
      "Wait for the current build to finish or cancel it before changing project settings.",
    );
    this.maintenanceActive = true;
    try {
      if (settings.rootFile !== null) {
        if (!settings.rootFile.toLowerCase().endsWith(".tex")) {
          throw new ProjectSessionError(
            "no-root",
            "The selected root file must have a .tex extension.",
          );
        }
        await this.service.readTextFile(settings.rootFile);
      }
      normalizeProjectPath(settings.buildDirectory);

      const previousBuildDirectory = this.metadata.buildDirectory;
      const nextMetadata: ProjectMetadata = {
        schemaVersion: 2,
        ...settings,
      };
      await saveProjectMetadata(this.service.root, nextMetadata);
      this.metadata = nextMetadata;
      this.projectDescription.rootFile = settings.rootFile;
      this.projectDescription.autoBuild = settings.autoBuild;
      this.projectDescription.settings = settings;
      this.projectDescription.settingsIssues = [];

      if (previousBuildDirectory !== settings.buildDirectory) {
        await this.watcher?.close();
        this.watcher = this.createWatcher();
      }
      return settings;
    } finally {
      this.maintenanceActive = false;
    }
  }

  async cleanupAuxiliary(): Promise<number> {
    this.assertBuildIdle(
      "Wait for the current build to finish or cancel it before cleaning auxiliary files.",
    );
    this.maintenanceActive = true;
    try {
      return await cleanupAuxiliaryFiles(
        this.service.root,
        this.metadata.buildDirectory,
      );
    } finally {
      this.maintenanceActive = false;
    }
  }

  private async compileWithOptions(
    rootFile: string,
    clean: boolean,
  ): Promise<BuildView> {
    if (this.maintenanceActive) {
      throw new ProjectSessionError(
        "cleanup-busy",
        "Wait for auxiliary cleanup to finish before compiling.",
      );
    }
    const normalizedRoot = normalizeProjectPath(rootFile);
    if (!normalizedRoot.toLowerCase().endsWith(".tex")) {
      throw new ProjectSessionError(
        "no-root",
        "Select a LaTeX root file before compiling.",
      );
    }
    await this.service.readTextFile(normalizedRoot);
    const globalSettings = await this.getGlobalSettings();

    const ticket = this.controller.requestBuild({
      rootFile: normalizedRoot,
      buildDirectory: this.metadata.buildDirectory,
      recipe: metadataRecipe(this.metadata.recipe),
      timeoutMs: globalSettings.compileTimeoutMs,
      allowLatexmkRc: this.metadata.allowLatexmkRc,
      clean,
      ...(globalSettings.customBinDirectory === null
        ? {}
        : { customBinDirectory: globalSettings.customBinDirectory }),
    });
    const completion = await ticket.completion;
    const view = await this.buildView(
      ticket.buildId,
      ticket.generation,
      completion,
    );
    await this.pruneBuildGenerations(completion);
    return view;
  }

  private assertBuildIdle(message: string): void {
    const snapshot = this.controller.getSnapshot();
    if (
      this.maintenanceActive ||
      snapshot.activeBuildId !== null ||
      snapshot.queuedBuildId !== null
    ) {
      throw new ProjectSessionError("cleanup-busy", message);
    }
  }

  private async mutateProject(
    operation: () => Promise<void>,
  ): Promise<OpenProjectValue> {
    this.assertBuildIdle(
      "Wait for the current build to finish or cancel it before changing project files.",
    );
    this.maintenanceActive = true;
    const watcher = this.watcher;
    this.watcher = null;
    try {
      await watcher?.close();
      await operation();
      await this.refreshProjectDescription();
      return this.describe();
    } finally {
      try {
        this.watcher = this.createWatcher();
      } finally {
        this.maintenanceActive = false;
      }
    }
  }

  private async refreshProjectDescription(): Promise<void> {
    const [entries, rootCandidates] = await Promise.all([
      this.service.listEntries(),
      this.service.detectRootFiles(),
    ]);
    const configuredRoot = this.metadata.rootFile;
    const rootFile =
      configuredRoot !== null &&
      entries.some(
        (entry) => entry.kind === "file" && entry.path === configuredRoot,
      )
        ? configuredRoot
        : (rootCandidates[0]?.path ?? null);
    if (this.metadata.rootFile !== rootFile) {
      this.metadata = { ...this.metadata, rootFile };
      await saveProjectMetadata(this.service.root, this.metadata);
    }
    this.projectDescription.entries = entries;
    this.projectDescription.rootCandidates = rootCandidates;
    this.projectDescription.rootFile = rootFile;
    this.projectDescription.settings = toProjectSettings(this.metadata);
    this.projectDescription.settingsIssues = [];
  }

  cancelBuild(): Promise<boolean> {
    return this.controller.cancelActiveBuild();
  }

  async dispose(): Promise<void> {
    await this.cancelBuild();
    await this.watcher?.close();
  }

  private createWatcher(): ProjectWatcher | null {
    if (this.onFileChange === undefined) {
      return null;
    }
    return new ProjectWatcher({
      root: this.service.root,
      buildDirectory: this.metadata.buildDirectory,
      onChange: (change) => {
        this.onFileChange?.({
          ...change,
          projectId: this.projectDescription.projectId,
        });
      },
      onError: (error) => {
        console.error("Project file watcher failed.", error);
      },
      readVersion: async (path) =>
        (await this.service.readTextFile(path)).version,
    });
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

  async forwardSync(request: ForwardSyncRequest): Promise<ForwardSyncTarget> {
    const context = await this.resolveSyncContext(request);
    const normalizedPath = normalizeProjectPath(request.path);
    await this.service.readTextFile(normalizedPath);
    const sourcePath = await resolveProjectPath(
      this.service.root,
      normalizedPath,
    );
    try {
      return await this.synctex.forward({
        projectDirectory: this.service.root,
        sourcePath,
        line: request.line,
        column: request.column,
        pdfPath: context.pdfPath,
        buildDirectory: dirname(context.synctexPath),
      });
    } catch (error) {
      throw mapSynctexError(error);
    }
  }

  async inverseSync(request: InverseSyncRequest): Promise<InverseSyncTarget> {
    const context = await this.resolveSyncContext(request);
    try {
      return await this.synctex.inverse({
        projectDirectory: this.service.root,
        page: request.page,
        x: request.x,
        y: request.y,
        pdfPath: context.pdfPath,
        buildDirectory: dirname(context.synctexPath),
        projectFiles: this.projectDescription.entries
          .filter((entry) => entry.kind === "file")
          .map((entry) => entry.path),
      });
    } catch (error) {
      throw mapSynctexError(error);
    }
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
        diagnostics: [],
        visiblePdf: this.visiblePdfArtifact(),
      };
    }

    const rawLog = await this.readDisplayLog(
      result.logPath,
      result.stdout,
      result.stderr,
      result.outputTruncated,
    );
    const diagnostics = parseBuildDiagnostics({
      log: rawLog.text,
      status: result.status,
      failureReason: result.failureReason,
      rootFile: this.projectDescription.rootFile ?? result.rootFile ?? "",
      projectFiles: this.projectDescription.entries
        .filter((entry) => entry.kind === "file")
        .map((entry) => entry.path),
    });
    return {
      buildId: result.buildId,
      generation: result.generation,
      disposition: completion.disposition,
      status: result.status,
      durationMs: result.durationMs,
      failureReason: result.failureReason,
      log: rawLog.text,
      logTruncated: rawLog.truncated,
      diagnostics,
      visiblePdf: this.visiblePdfArtifact(),
    };
  }

  private async pruneBuildGenerations(
    completion: BuildCompletion,
  ): Promise<void> {
    const generationsPath = await resolveProjectPath(
      this.service.root,
      `${normalizeProjectPath(this.metadata.buildDirectory)}/generations`,
      { allowMissing: true },
    );
    const preserveNames = new Set<string>();
    const current = completion.result?.buildDirectory;
    if (current !== null && current !== undefined) {
      preserveNames.add(basename(current));
    }
    const successful = this.controller.getSnapshot().lastSuccessfulBuild;
    if (successful !== null) {
      preserveNames.add(basename(dirname(successful.pdfPath)));
    }
    await pruneGenerationDirectories(generationsPath, preserveNames).catch(
      (error: unknown) => {
        console.error("Build generation retention failed.", error);
      },
    );
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
    processOutputTruncated: boolean,
  ): Promise<{ text: string; truncated: boolean }> {
    const sections: string[] = [];
    let truncated = processOutputTruncated;
    if (logPath !== null) {
      try {
        const buildLog = await readBoundedUtf8(
          await this.safeGeneratedPath(logPath),
          MAX_DISPLAY_LOG_CHARACTERS,
        );
        sections.push(buildLog.text);
        truncated ||= buildLog.truncated;
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
    if (!truncated && text.length <= MAX_DISPLAY_LOG_CHARACTERS) {
      return { text, truncated: false };
    }
    const contentLimit = Math.max(
      MAX_DISPLAY_LOG_CHARACTERS - DISPLAY_TRUNCATION_NOTICE.length,
      0,
    );
    return {
      text: `${text.slice(0, contentLimit)}${DISPLAY_TRUNCATION_NOTICE}`,
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

  private async resolveSyncContext(
    request: PdfArtifactRequest,
  ): Promise<{ pdfPath: string; synctexPath: string }> {
    const resolvedPdf = await this.resolvePdf(request);
    if (!resolvedPdf.artifact.isCurrent) {
      throw new ProjectSessionError(
        "synctex-stale",
        "Compile the current source before using SyncTeX navigation.",
      );
    }
    const successful = this.controller.getSnapshot().lastSuccessfulBuild;
    if (
      successful === null ||
      successful.buildId !== request.buildId ||
      successful.generation !== request.generation ||
      successful.synctexPath === null
    ) {
      throw new ProjectSessionError(
        "synctex-unavailable",
        "This build did not produce SyncTeX data. Compile again and check the MiKTeX setup.",
      );
    }
    try {
      const synctexPath = await this.safeGeneratedPath(successful.synctexPath);
      const synctexStat = await stat(synctexPath);
      if (!synctexStat.isFile()) {
        throw new Error("SyncTeX output is not a file.");
      }
      return { pdfPath: resolvedPdf.path, synctexPath };
    } catch (error) {
      if (error instanceof ProjectSessionError) {
        throw error;
      }
      throw new ProjectSessionError(
        "synctex-unavailable",
        "SyncTeX data for the current build is no longer available.",
      );
    }
  }
}

async function readBoundedUtf8(
  path: string,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(maxBytes + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return {
      text: buffer.subarray(0, Math.min(bytesRead, maxBytes)).toString("utf8"),
      truncated: bytesRead > maxBytes,
    };
  } finally {
    await handle.close();
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

function toProjectSettings(metadata: ProjectMetadata): ProjectSettings {
  return {
    rootFile: metadata.rootFile,
    recipe: metadata.recipe,
    buildDirectory: metadata.buildDirectory,
    autoBuild: metadata.autoBuild,
    allowLatexmkRc: metadata.allowLatexmkRc,
  };
}

function pathKey(path: string): string {
  return process.platform === "win32" ? path.toLocaleLowerCase("en-US") : path;
}

function mapSynctexError(error: unknown): ProjectSessionError {
  if (error instanceof SynctexServiceError) {
    return new ProjectSessionError(error.code, error.message);
  }
  return new ProjectSessionError(
    "synctex-failed",
    "SyncTeX navigation failed unexpectedly.",
  );
}
