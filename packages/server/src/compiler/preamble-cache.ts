import { createHash } from "node:crypto";
import { mkdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { atomicWriteFile, normalizeProjectPath, resolveProjectPath } from "../project-store.js";
import type { ProcessRunner } from "./process-runner.js";

export const CACHE_DIRECTORY_NAME = ".texpulse-cache";
export const FORMAT_JOB_NAME = "preamble_cache";
const FORMAT_META_FILENAME = "preamble_cache.meta.json";

export interface SplitPreambleResult {
  preamble: string;
  body: string;
  splitMacro: "\\endofdump" | "\\fastrecompileendpreamble" | "\\begin{document}" | null;
}

export interface PreambleCacheMeta {
  schemaVersion: 1;
  preambleHash: string;
  rootFile: string;
  createdAt: string;
}

export interface EnsureFormatCacheResult {
  ready: boolean;
  cacheHit: boolean;
  preambleHash: string;
  fmtPath: string;
  dumpDurationMs: number;
  error: string | null;
}

/**
 * Splits a root `.tex` file at an explicit dump macro (`\endofdump`,
 * `\fastrecompileendpreamble`) or at `\begin{document}`.
 */
export function splitLatexPreamble(texContent: string): SplitPreambleResult {
  const explicitMatch = /^[^%\n]*\\(endofdump|fastrecompileendpreamble)\b/mu.exec(texContent);
  if (explicitMatch && explicitMatch.index !== undefined) {
    const endIdx = explicitMatch.index + explicitMatch[0].length;
    return {
      preamble: texContent.slice(0, endIdx),
      body: texContent.slice(endIdx),
      splitMacro:
        explicitMatch[1] === "endofdump"
          ? "\\endofdump"
          : "\\fastrecompileendpreamble",
    };
  }

  const beginDocMatch = /^[^%\n]*\\begin\s*\{document\}/mu.exec(texContent);
  if (beginDocMatch && beginDocMatch.index !== undefined) {
    return {
      preamble: texContent.slice(0, beginDocMatch.index),
      body: texContent.slice(beginDocMatch.index),
      splitMacro: "\\begin{document}",
    };
  }

  return {
    preamble: "",
    body: texContent,
    splitMacro: null,
  };
}

/**
 * Extracts local `.tex`, `.sty`, or `.cls` paths referenced in uncommented
 * preamble commands (`\input`, `\include`, `\usepackage`, `\documentclass`).
 */
export function extractPreambleDependencies(preamble: string): string[] {
  const deps = new Set<string>();
  const uncommented = preamble.replace(/(^|[^\\])%.*$/gmu, "$1");

  const inputRe = /\\(?:input|include)\s*\{([^}]+)\}/gu;
  for (const match of uncommented.matchAll(inputRe)) {
    const raw = (match[1] ?? "").trim();
    if (!raw) continue;
    deps.add(/\.[a-z0-9]+$/iu.test(raw) ? raw : `${raw}.tex`);
  }

  const pkgRe = /\\usepackage\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/gu;
  for (const match of uncommented.matchAll(pkgRe)) {
    const list = (match[1] ?? "").split(",");
    for (const item of list) {
      const name = item.trim();
      if (!name) continue;
      deps.add(name.endsWith(".sty") ? name : `${name}.sty`);
    }
  }

  const clsRe = /\\documentclass\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/gu;
  for (const match of uncommented.matchAll(clsRe)) {
    const name = (match[1] ?? "").trim();
    if (!name) continue;
    deps.add(name.endsWith(".cls") ? name : `${name}.cls`);
  }

  return [...deps].sort();
}

/**
 * Computes a deterministic SHA-256 hash of the document preamble and any
 * referenced local workspace files (mtime + size + SHA-256 content).
 */
export async function computePreambleHash(
  projectRoot: string,
  texContent: string,
): Promise<string> {
  const { preamble, splitMacro } = splitLatexPreamble(texContent);
  const hash = createHash("sha256");
  hash.update(splitMacro ?? "none");
  hash.update("\0");
  hash.update(preamble.replaceAll("\r\n", "\n"));

  const deps = extractPreambleDependencies(preamble);
  for (const dep of deps) {
    let normalized: string;
    try {
      normalized = normalizeProjectPath(dep);
    } catch {
      continue;
    }

    try {
      const resolved = await resolveProjectPath(projectRoot, normalized);
      const fileStat = await stat(resolved);
      if (fileStat.isFile()) {
        const bytes = await readFile(resolved);
        const contentHash = createHash("sha256").update(bytes).digest("hex");
        hash.update(`\0dep:${normalized}:${String(fileStat.mtimeMs)}:${String(fileStat.size)}:${contentHash}`);
      }
    } catch {
      // Standard CTAN system packages (\usepackage{amsmath}, article.cls) live outside
      // the project directory and do not invalidate the project hash on missing local file.
    }
  }

  return hash.digest("hex");
}

/**
 * Builds `pdflatex -ini` arguments to dump the binary `preamble_cache.fmt`
 * via `mylatexformat.ltx` into `.texpulse-cache/`.
 */
export function buildFormatDumpArgs(
  rootFile: string,
  cacheDir = CACHE_DIRECTORY_NAME,
): readonly string[] {
  return [
    "-ini",
    "-interaction=nonstopmode",
    "-file-line-error",
    "-no-shell-escape",
    `-output-directory=${cacheDir}`,
    `-jobname=${FORMAT_JOB_NAME}`,
    "&pdflatex",
    "mylatexformat.ltx",
    rootFile,
  ];
}

/**
 * Builds Tier 2 cached `pdflatex` compile arguments using `--fmt` + SyncTeX
 * + strict `-no-shell-escape`.
 */
export function buildCachedCompileArgs(
  rootFile: string,
  cacheDir = CACHE_DIRECTORY_NAME,
): readonly string[] {
  return [
    `--fmt=${cacheDir}/${FORMAT_JOB_NAME}`,
    "-synctex=1",
    "-interaction=nonstopmode",
    "-file-line-error",
    "-no-shell-escape",
    `-aux-directory=${cacheDir}`,
    `-output-directory=${cacheDir}`,
    rootFile,
  ];
}

export class PreambleCacheService {
  constructor(private readonly pdflatexExecutable = "pdflatex") {}

  async ensureFormatCache(
    projectRoot: string,
    rootFile: string,
    texContent: string,
    processRunner: ProcessRunner,
    signal?: AbortSignal,
  ): Promise<EnsureFormatCacheResult> {
    const cacheDir = resolve(projectRoot, CACHE_DIRECTORY_NAME);
    const fmtPath = join(cacheDir, `${FORMAT_JOB_NAME}.fmt`);
    const metaPath = join(cacheDir, FORMAT_META_FILENAME);
    const preambleHash = await computePreambleHash(projectRoot, texContent);
    const split = splitLatexPreamble(texContent);

    if (split.splitMacro === null || split.preamble.trim() === "") {
      return {
        ready: false,
        cacheHit: false,
        preambleHash,
        fmtPath,
        dumpDurationMs: 0,
        error: "Document does not contain a dumpable preamble split boundary.",
      };
    }

    const existingMeta = await readCacheMeta(metaPath);
    const fmtExists = await isRegularFile(fmtPath);
    if (
      fmtExists &&
      existingMeta !== null &&
      existingMeta.preambleHash === preambleHash &&
      existingMeta.rootFile === rootFile
    ) {
      return {
        ready: true,
        cacheHit: true,
        preambleHash,
        fmtPath,
        dumpDurationMs: 0,
        error: null,
      };
    }

    await mkdir(cacheDir, { recursive: true });
    const dumpResult = await processRunner.run({
      executable: this.pdflatexExecutable,
      args: buildFormatDumpArgs(rootFile, CACHE_DIRECTORY_NAME),
      cwd: projectRoot,
      timeoutMs: 60_000,
      ...(signal === undefined ? {} : { signal }),
    });

    const createdFmt = await isRegularFile(fmtPath);
    if (dumpResult.exitCode !== 0 || !createdFmt) {
      return {
        ready: false,
        cacheHit: false,
        preambleHash,
        fmtPath,
        dumpDurationMs: dumpResult.durationMs,
        error:
          dumpResult.error ??
          `mylatexformat dump failed with exit code ${String(dumpResult.exitCode)}`,
      };
    }

    const meta: PreambleCacheMeta = {
      schemaVersion: 1,
      preambleHash,
      rootFile,
      createdAt: new Date().toISOString(),
    };
    await atomicWriteFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, false);

    return {
      ready: true,
      cacheHit: false,
      preambleHash,
      fmtPath,
      dumpDurationMs: dumpResult.durationMs,
      error: null,
    };
  }
}

async function readCacheMeta(metaPath: string): Promise<PreambleCacheMeta | null> {
  try {
    const raw = await readFile(metaPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<PreambleCacheMeta>;
    if (
      parsed.schemaVersion === 1 &&
      typeof parsed.preambleHash === "string" &&
      typeof parsed.rootFile === "string"
    ) {
      return parsed as PreambleCacheMeta;
    }
    return null;
  } catch {
    return null;
  }
}

async function isRegularFile(path: string): Promise<boolean> {
  try {
    const fileStat = await stat(path);
    return fileStat.isFile() && fileStat.size > 0;
  } catch {
    return false;
  }
}
