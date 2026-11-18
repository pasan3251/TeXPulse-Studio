import { randomUUID } from "node:crypto";
import { link, lstat, mkdir, open, readFile, readdir, realpath, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, posix, relative, resolve, sep, win32 } from "node:path";
import { inferProjectFileKind, type ProjectFile } from "@texpulse/shared";

const DEFAULT_IGNORED_DIRECTORIES = new Set([
  ".git",
  ".texpulse",
  ".texpulse-cache",
  "coverage",
  "dist",
  "legacy-v1",
  "node_modules",
]);

const MAX_TEXT_FILE_BYTES = 10 * 1024 * 1024;

export class ProjectPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectPathError";
  }
}

/**
 * Validates and normalizes a project-relative path (salvaged from v1
 * project-paths.ts) to prevent path traversal or NUL injection.
 */
export function normalizeProjectPath(projectPath: string): string {
  if (
    projectPath.includes("\0") ||
    isAbsolute(projectPath) ||
    win32.isAbsolute(projectPath) ||
    posix.isAbsolute(projectPath)
  ) {
    throw new ProjectPathError(`Project paths must be relative: ${projectPath}`);
  }

  const normalized = posix.normalize(projectPath.replaceAll("\\", "/"));
  if (normalized === ".." || normalized.startsWith("../") || normalized === ".") {
    throw new ProjectPathError(`Path escapes the project boundary: ${projectPath}`);
  }
  return normalized;
}

function toNativePath(normalizedPath: string): string {
  return normalizedPath.split("/").join(sep);
}

function isPathInside(root: string, candidate: string): boolean {
  const remainder = relative(root, candidate);
  return (
    remainder === "" ||
    (!remainder.startsWith(`..${sep}`) &&
      remainder !== ".." &&
      !isAbsolute(remainder))
  );
}

/**
 * Resolves a project-relative path inside `root` while rejecting symbolic links
 * and Windows junctions.
 */
export async function resolveProjectPath(
  root: string,
  projectPath: string,
  allowMissing = false,
): Promise<string> {
  const normalized = normalizeProjectPath(projectPath);
  const candidate = resolve(root, toNativePath(normalized));
  if (!isPathInside(root, candidate)) {
    throw new ProjectPathError(`Path escapes the project boundary: ${projectPath}`);
  }

  let current = root;
  let encounteredMissing = false;
  for (const segment of normalized.split("/")) {
    current = resolve(current, segment);
    if (encounteredMissing) continue;

    try {
      const entryStat = await lstat(current);
      if (entryStat.isSymbolicLink()) {
        throw new ProjectPathError(`Symbolic links cannot be traversed: ${projectPath}`);
      }
    } catch (error) {
      if (error instanceof ProjectPathError) throw error;
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        encounteredMissing = true;
        continue;
      }
      throw error;
    }
  }

  if (encounteredMissing && !allowMissing) {
    throw new ProjectPathError(`Project file does not exist: ${projectPath}`);
  }
  if (!encounteredMissing) {
    const canonical = await realpath(candidate);
    if (!isPathInside(root, canonical)) {
      throw new ProjectPathError(`Resolved path escapes boundary: ${projectPath}`);
    }
  }
  return candidate;
}

/**
 * Atomically writes bytes or UTF-8 text to disk via a temporary file, fsync,
 * and rename (salvaged from v1 atomic-write.ts).
 */
export async function atomicWriteBytes(
  targetPath: string,
  content: Uint8Array | string,
  createOnly = false,
): Promise<void> {
  const directory = dirname(targetPath);
  await mkdir(directory, { recursive: true });
  const temporaryPath = join(
    directory,
    `.${basename(targetPath)}.${randomUUID()}.tmp`,
  );
  const handle = await open(temporaryPath, "wx");

  try {
    try {
      if (typeof content === "string") {
        await handle.writeFile(content, "utf8");
      } else {
        await handle.writeFile(content);
      }
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (createOnly) {
      await link(temporaryPath, targetPath);
      await rm(temporaryPath);
    } else {
      await rename(temporaryPath, targetPath);
    }
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function atomicWriteFile(
  targetPath: string,
  content: string,
  createOnly = false,
): Promise<void> {
  await atomicWriteBytes(targetPath, content, createOnly);
}

export class LocalProjectStore {
  private constructor(readonly rootDirectory: string) {}

  static async open(projectDirectory: string): Promise<LocalProjectStore> {
    const canonical = await realpath(resolve(projectDirectory));
    const rootStat = await stat(canonical);
    if (!rootStat.isDirectory()) {
      throw new ProjectPathError(`Not a directory: ${projectDirectory}`);
    }
    return new LocalProjectStore(canonical);
  }

  async listTextFiles(): Promise<ProjectFile[]> {
    const results: ProjectFile[] = [];

    const visit = async (dir: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true });
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (DEFAULT_IGNORED_DIRECTORIES.has(entry.name.toLowerCase())) {
          continue;
        }
        const absolute = resolve(dir, entry.name);
        const entryStat = await lstat(absolute);
        if (entryStat.isSymbolicLink()) continue;
        if (entryStat.isDirectory()) {
          await visit(absolute);
          continue;
        }
        if (!entryStat.isFile() || entryStat.size > MAX_TEXT_FILE_BYTES) {
          continue;
        }
        const portablePath = relative(this.rootDirectory, absolute).split(sep).join("/");
        const kind = inferProjectFileKind(portablePath);
        if (kind === "other" && !portablePath.toLowerCase().endsWith(".md")) {
          continue;
        }
        const bytes = await readFile(absolute);
        const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        results.push({
          path: portablePath,
          content,
          kind,
          lastModified: entryStat.mtimeMs,
        });
      }
    };

    await visit(this.rootDirectory);
    return results;
  }

  async writeProjectFile(projectPath: string, content: string): Promise<ProjectFile> {
    const normalized = normalizeProjectPath(projectPath);
    const target = await resolveProjectPath(this.rootDirectory, normalized, true);
    await atomicWriteFile(target, content, false);
    const updatedStat = await stat(target);
    return {
      path: normalized,
      content,
      kind: inferProjectFileKind(normalized),
      lastModified: updatedStat.mtimeMs,
    };
  }

  async writeProjectBinaryFile(projectPath: string, bytes: Uint8Array): Promise<string> {
    const normalized = normalizeProjectPath(projectPath);
    const target = await resolveProjectPath(this.rootDirectory, normalized, true);
    await atomicWriteBytes(target, bytes, false);
    return normalized;
  }
}
