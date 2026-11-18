import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, stat, unlink } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import {
  LATEXMK_BASE_FLAGS,
  type CompileEngine,
  type CompileResultPayload,
  type CompileTier,
  type DiagnosticItem,
} from "@texpulse/shared";
import { normalizeLogFilePath, parseSettledLogs } from "@texpulse/log-parser";
import { normalizeProjectPath, resolveProjectPath } from "../project-store.js";
import {
  CACHE_DIRECTORY_NAME,
  FORMAT_JOB_NAME,
  PreambleCacheService,
  buildCachedCompileArgs,
  computePreambleHash,
} from "./preamble-cache.js";
import { NodeProcessRunner, type ProcessResult, type ProcessRunner } from "./process-runner.js";

const DEFAULT_COMPILE_TIMEOUT_MS = 120_000;
const MAX_LOG_BYTES = 2 * 1024 * 1024;
const MAX_PDF_BYTES = 100 * 1024 * 1024;

export interface CompileOptions {
  rootFile: string;
  engine?: CompileEngine | undefined;
  forceFullBuild?: boolean | undefined;
  knownFiles?: ReadonlyArray<{ path: string; content: string }> | undefined;
}

export interface CompilerRunnerDependencies {
  processRunner?: ProcessRunner | undefined;
  preambleCache?: PreambleCacheService | undefined;
  latexmkExecutable?: string | undefined;
  pdflatexExecutable?: string | undefined;
}

const ENGINE_LATEXMK_FLAGS: Record<CompileEngine, string> = {
  pdflatex: "-pdf",
  xelatex: "-xelatex",
  lualatex: "-lualatex",
};

/**
 * Builds deterministic `latexmk` CLI flags enforcing all non-negotiable
 * invariants in `LATEXMK_BASE_FLAGS` plus `-norc` and `.texpulse-cache` outdir.
 */
export function buildLatexmkArguments(
  engine: CompileEngine,
  rootFile: string,
  cacheDir = CACHE_DIRECTORY_NAME,
): readonly string[] {
  return [
    "-norc",
    ENGINE_LATEXMK_FLAGS[engine],
    ...LATEXMK_BASE_FLAGS,
    `-outdir=${cacheDir}`,
    rootFile,
  ];
}

export class CompilerRunner {
  private readonly processRunner: ProcessRunner;
  private readonly preambleCache: PreambleCacheService;
  private readonly latexmkExecutable: string;
  private readonly pdflatexExecutable: string;

  private activeController: AbortController | null = null;
  private activePromise: Promise<void> | null = null;
  private lastBibHashByRoot = new Map<string, string>();

  constructor(
    private readonly projectRoot: string,
    deps: CompilerRunnerDependencies = {},
  ) {
    this.processRunner = deps.processRunner ?? new NodeProcessRunner();
    this.pdflatexExecutable = deps.pdflatexExecutable ?? "pdflatex";
    this.latexmkExecutable = deps.latexmkExecutable ?? "latexmk";
    this.preambleCache =
      deps.preambleCache ?? new PreambleCacheService(this.pdflatexExecutable);
  }

  /**
   * Cancels any running compiler process tree and waits for cleanup to settle.
   */
  async cancelActiveBuild(): Promise<boolean> {
    if (this.activeController === null) {
      return false;
    }
    this.activeController.abort();
    await this.activePromise?.catch(() => undefined);
    return true;
  }

  async compile(options: CompileOptions): Promise<CompileResultPayload> {
    await this.cancelActiveBuild();

    const controller = new AbortController();
    this.activeController = controller;
    const signal = controller.signal;

    const runPromise = this.executeCompile(options, signal);
    this.activePromise = runPromise.then(
      () => undefined,
      () => undefined,
    );

    try {
      return await runPromise;
    } finally {
      if (this.activeController === controller) {
        this.activeController = null;
        this.activePromise = null;
      }
    }
  }

  async readPdfBytes(rootFile: string): Promise<Uint8Array> {
    const normalizedRoot = normalizeProjectPath(rootFile);
    const jobName = basename(normalizedRoot, extname(normalizedRoot));
    const pdfPath = resolve(this.projectRoot, CACHE_DIRECTORY_NAME, `${jobName}.pdf`);
    const fileStat = await stat(pdfPath);
    if (!fileStat.isFile() || fileStat.size > MAX_PDF_BYTES) {
      throw new Error("Compiled PDF artifact is unavailable or exceeds size limits.");
    }
    return new Uint8Array(await readFile(pdfPath));
  }

  getSyncPaths(rootFile: string): {
    buildDirectory: string;
    pdfPath: string;
    synctexPath: string;
  } {
    const normalizedRoot = normalizeProjectPath(rootFile);
    const jobName = basename(normalizedRoot, extname(normalizedRoot));
    const buildDirectory = resolve(this.projectRoot, CACHE_DIRECTORY_NAME);
    return {
      buildDirectory,
      pdfPath: join(buildDirectory, `${jobName}.pdf`),
      synctexPath: join(buildDirectory, `${jobName}.synctex.gz`),
    };
  }

  private async executeCompile(
    options: CompileOptions,
    signal: AbortSignal,
  ): Promise<CompileResultPayload> {
    const buildId = randomUUID();
    const startTime = performance.now();
    const engine: CompileEngine = options.engine ?? "pdflatex";
    const normalizedRoot = normalizeProjectPath(options.rootFile);
    const rootAbsolute = await resolveProjectPath(this.projectRoot, normalizedRoot);
    const texContent = await readFile(rootAbsolute, "utf8");
    const jobName = basename(normalizedRoot, extname(normalizedRoot));

    const cacheDir = resolve(this.projectRoot, CACHE_DIRECTORY_NAME);
    await mkdir(cacheDir, { recursive: true });

    const bibHash = await this.computeBibHash(texContent);
    const bibMissing = await this.needsInitialBibtex(texContent, cacheDir, jobName);
    const prevBibHash = this.lastBibHashByRoot.get(normalizedRoot);
    const bibChanged = prevBibHash !== undefined ? prevBibHash !== bibHash : bibHash !== "none";

    let preambleHash = await computePreambleHash(this.projectRoot, texContent);
    let preambleCacheHit = false;
    let tier: CompileTier = "tier3-latexmk";
    let processResult: ProcessResult;

    const canUseTier2 =
      engine === "pdflatex" &&
      options.forceFullBuild !== true &&
      !bibMissing &&
      !bibChanged;

    if (canUseTier2) {
      const fmtResult = await this.preambleCache.ensureFormatCache(
        this.projectRoot,
        normalizedRoot,
        texContent,
        this.processRunner,
        signal,
      );
      preambleHash = fmtResult.preambleHash;
      preambleCacheHit = fmtResult.cacheHit;

      if (signal.aborted) {
        return this.cancelledPayload(buildId, "tier2-fmt", engine, startTime, preambleHash, preambleCacheHit);
      }

      if (fmtResult.ready) {
        tier = "tier2-fmt";
        processResult = await this.processRunner.run({
          executable: this.pdflatexExecutable,
          args: buildCachedCompileArgs(normalizedRoot, CACHE_DIRECTORY_NAME),
          cwd: this.projectRoot,
          timeoutMs: DEFAULT_COMPILE_TIMEOUT_MS,
          signal,
        });

        // If MiKTeX reports a stale/corrupt format error, evict .fmt and fall back cleanly
        const tier2LogText = await readBoundedFile(join(cacheDir, `${jobName}.log`));
        if (
          processResult.exitCode !== 0 &&
          processResult.terminationReason === null &&
          (/Fatal format file error/iu.test(tier2LogText) ||
            /Fatal format file error/iu.test(processResult.stderr))
        ) {
          await unlink(join(cacheDir, `${FORMAT_JOB_NAME}.fmt`)).catch(() => undefined);
          tier = "tier3-latexmk";
          preambleCacheHit = false;
          processResult = await this.runTier3Latexmk(engine, normalizedRoot, signal);
        }
      } else {
        tier = "tier3-latexmk";
        processResult = await this.runTier3Latexmk(engine, normalizedRoot, signal);
      }
    } else {
      tier = "tier3-latexmk";
      processResult = await this.runTier3Latexmk(engine, normalizedRoot, signal);
      // Warm Tier 2 .fmt cache right after a successful pdflatex Tier 3 run so
      // the next body edit hits the precompiled preamble cache immediately.
      if (
        engine === "pdflatex" &&
        processResult.exitCode === 0 &&
        !signal.aborted
      ) {
        const warmed = await this.preambleCache.ensureFormatCache(
          this.projectRoot,
          normalizedRoot,
          texContent,
          this.processRunner,
          signal,
        );
        preambleHash = warmed.preambleHash;
      }
    }

    if (processResult.exitCode === 0) {
      this.lastBibHashByRoot.set(normalizedRoot, bibHash);
    }

    // Never parse compiler diagnostics from stdout; read settled .log and .blg from disk
    const logPath = join(cacheDir, `${jobName}.log`);
    const blgPath = join(cacheDir, `${jobName}.blg`);
    const pdfPath = join(cacheDir, `${jobName}.pdf`);
    const synctexPath = join(cacheDir, `${jobName}.synctex.gz`);

    const [logText, blgText, pdfAvailable, synctexAvailable] = await Promise.all([
      readBoundedFile(logPath),
      readBoundedFile(blgPath),
      fileExists(pdfPath),
      fileExists(synctexPath),
    ]);

    const bibContentByPath: Record<string, string> = {};
    const texContentByPath: Record<string, string> = {
      [normalizedRoot]: texContent,
    };
    for (const file of options.knownFiles ?? []) {
      const normalized = normalizeProjectPath(file.path);
      if (normalized.toLowerCase().endsWith(".bib")) {
        bibContentByPath[normalized] = file.content;
      } else if (normalized.toLowerCase().endsWith(".tex")) {
        texContentByPath[normalized] = file.content;
      }
    }

    const diagnostics = this.parseSettledCompilerDiagnostics({
      logText,
      blgText,
      normalizedRoot,
      bibContentByPath,
      texContentByPath,
    });

    const status =
      processResult.terminationReason === "cancelled"
        ? "cancelled"
        : processResult.terminationReason === "timed-out"
          ? "timed-out"
          : processResult.exitCode === 0 && pdfAvailable && processResult.error === null
            ? "succeeded"
            : "failed";

    const failureReason =
      status === "succeeded"
        ? null
        : status === "cancelled"
          ? "Build cancelled."
          : status === "timed-out"
            ? "Build timed out."
            : processResult.error ??
              (diagnostics.find((d) => d.category === "error")?.humanTitle ??
                (processResult.exitCode !== 0
                  ? `${tier === "tier2-fmt" ? "pdflatex --fmt" : "latexmk"} exited with code ${String(processResult.exitCode)}.`
                  : "Compiler exited without producing a readable PDF."));

    return {
      buildId,
      status,
      tier,
      engine,
      durationMs: Math.round(performance.now() - startTime),
      preambleHash,
      preambleCacheHit,
      pdfAvailable,
      synctexAvailable,
      logText,
      blgText,
      diagnostics,
      failureReason,
      completedAt: new Date().toISOString(),
    };
  }

  private parseSettledCompilerDiagnostics(params: {
    logText: string;
    blgText: string;
    normalizedRoot: string;
    bibContentByPath: Record<string, string>;
    texContentByPath: Record<string, string>;
  }): DiagnosticItem[] {
    const rawItems = parseSettledLogs({
      logText: params.logText,
      blgText: params.blgText,
      rootFile: params.normalizedRoot,
      ignoreDuplicates: true,
      bibContentByPath: params.bibContentByPath,
      texContentByPath: params.texContentByPath,
    });
    const rootNormalized = this.projectRoot.replaceAll("\\", "/").replace(/\/+$/u, "");
    const rootLower = `${rootNormalized.toLowerCase()}/`;

    return rawItems.map((item) => {
      const cleanForward = item.file.replaceAll("\\", "/");
      let relativeFile = cleanForward;
      if (cleanForward.toLowerCase().startsWith(rootLower)) {
        relativeFile = cleanForward.slice(rootLower.length);
      }
      return {
        ...item,
        file: normalizeLogFilePath(relativeFile, params.normalizedRoot),
      };
    });
  }

  private async runTier3Latexmk(
    engine: CompileEngine,
    normalizedRoot: string,
    signal: AbortSignal,
  ): Promise<ProcessResult> {
    // Tier 2 --fmt builds update .pdf/.aux without updating latexmk's .fdb_latexmk;
    // remove stale .fdb_latexmk so Tier 3 never skips rebuilding out-of-sync targets.
    const jobName = basename(normalizedRoot, extname(normalizedRoot));
    await unlink(join(resolve(this.projectRoot, CACHE_DIRECTORY_NAME), `${jobName}.fdb_latexmk`)).catch(
      () => undefined,
    );
    return this.processRunner.run({
      executable: this.latexmkExecutable,
      args: buildLatexmkArguments(engine, normalizedRoot, CACHE_DIRECTORY_NAME),
      cwd: this.projectRoot,
      timeoutMs: DEFAULT_COMPILE_TIMEOUT_MS,
      signal,
    });
  }

  private async needsInitialBibtex(
    texContent: string,
    cacheDir: string,
    jobName: string,
  ): Promise<boolean> {
    const usesBib = /\\(?:bibliography|addbibresource)\s*\{/u.test(texContent);
    if (!usesBib) return false;
    const bblExists = await fileExists(join(cacheDir, `${jobName}.bbl`));
    const pdfExists = await fileExists(join(cacheDir, `${jobName}.pdf`));
    return !bblExists || !pdfExists;
  }

  private async computeBibHash(texContent: string): Promise<string> {
    const match = /\\bibliography\s*\{([^}]+)\}/u.exec(texContent);
    if (!match?.[1]) return "none";
    const hash = createHash("sha256");
    for (const rawName of match[1].split(",")) {
      const trimmed = rawName.trim();
      if (!trimmed) continue;
      const rel = trimmed.endsWith(".bib") ? trimmed : `${trimmed}.bib`;
      try {
        const bytes = await readFile(resolve(this.projectRoot, rel));
        hash.update(rel);
        hash.update(bytes);
      } catch {
        hash.update(`missing:${rel}`);
      }
    }
    return hash.digest("hex");
  }

  private cancelledPayload(
    buildId: string,
    tier: CompileTier,
    engine: CompileEngine,
    startTime: number,
    preambleHash: string,
    preambleCacheHit: boolean,
  ): CompileResultPayload {
    return {
      buildId,
      status: "cancelled",
      tier,
      engine,
      durationMs: Math.round(performance.now() - startTime),
      preambleHash,
      preambleCacheHit,
      pdfAvailable: false,
      synctexAvailable: false,
      logText: "",
      blgText: "",
      diagnostics: [],
      failureReason: "Build cancelled before execution.",
      completedAt: new Date().toISOString(),
    };
  }
}

async function readBoundedFile(path: string): Promise<string> {
  try {
    const handle = await open(path, "r");
    try {
      const buffer = Buffer.alloc(MAX_LOG_BYTES);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      return buffer.subarray(0, bytesRead).toString("utf8");
    } finally {
      await handle.close();
    }
  } catch {
    return "";
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}
