import { lstat, realpath, stat } from "node:fs/promises";
import { isAbsolute, posix, relative, resolve, sep, win32 } from "node:path";

import { ProjectError } from "./project-types.js";

export interface ResolveProjectPathOptions {
  allowMissing?: boolean;
  allowRoot?: boolean;
}

export async function canonicalProjectRoot(
  projectDirectory: string,
): Promise<string> {
  const absolute = resolve(projectDirectory);
  let canonical: string;
  try {
    canonical = await realpath(absolute);
  } catch (error) {
    if (!isMissingPathError(error)) {
      throw error;
    }
    throw new ProjectError(
      "not-found",
      `Project directory does not exist: ${absolute}`,
    );
  }

  const projectStat = await stat(canonical);
  if (!projectStat.isDirectory()) {
    throw new ProjectError(
      "not-directory",
      `Project path is not a directory: ${absolute}`,
    );
  }
  return canonical;
}

export function normalizeProjectPath(
  projectPath: string,
  allowRoot = false,
): string {
  if (
    projectPath.includes("\0") ||
    isAbsolute(projectPath) ||
    win32.isAbsolute(projectPath) ||
    posix.isAbsolute(projectPath)
  ) {
    throw new ProjectError(
      "invalid-path",
      `Project paths must be relative: ${projectPath}`,
      projectPath,
    );
  }

  const portable = projectPath.replaceAll("\\", "/");
  const normalized = posix.normalize(portable);
  if (
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized === "."
  ) {
    if (normalized === "." && allowRoot) {
      return "";
    }
    throw new ProjectError(
      normalized === "." ? "invalid-path" : "path-escape",
      normalized === "."
        ? "A project entry path is required."
        : `Path escapes the project boundary: ${projectPath}`,
      projectPath,
    );
  }
  return normalized;
}

export function toNativeProjectPath(projectPath: string): string {
  return projectPath.split("/").join(sep);
}

export function toPortableProjectPath(projectPath: string): string {
  return projectPath.split(sep).join("/");
}

export function isPathInside(root: string, candidate: string): boolean {
  const remainder = relative(root, candidate);
  return (
    remainder === "" ||
    (!remainder.startsWith(`..${sep}`) &&
      remainder !== ".." &&
      !isAbsolute(remainder))
  );
}

export async function resolveProjectPath(
  root: string,
  projectPath: string,
  options: ResolveProjectPathOptions = {},
): Promise<string> {
  const normalized = normalizeProjectPath(
    projectPath,
    options.allowRoot ?? false,
  );
  const candidate = resolve(root, toNativeProjectPath(normalized));
  if (!isPathInside(root, candidate)) {
    throw new ProjectError(
      "path-escape",
      `Path escapes the project boundary: ${projectPath}`,
      projectPath,
    );
  }

  if (normalized === "") {
    return root;
  }

  const components = normalized.split("/");
  let current = root;
  let encounteredMissing = false;
  for (const component of components) {
    current = resolve(current, component);
    if (encounteredMissing) {
      continue;
    }

    try {
      const componentStat = await lstat(current);
      if (componentStat.isSymbolicLink()) {
        throw new ProjectError(
          "link-not-allowed",
          `Symbolic links and junctions cannot be traversed: ${projectPath}`,
          projectPath,
        );
      }
    } catch (error) {
      if (error instanceof ProjectError) {
        throw error;
      }
      if (isMissingPathError(error)) {
        encounteredMissing = true;
        continue;
      }
      throw error;
    }
  }

  if (encounteredMissing && options.allowMissing !== true) {
    throw new ProjectError(
      "not-found",
      `Project entry does not exist: ${projectPath}`,
      projectPath,
    );
  }

  if (!encounteredMissing) {
    const canonical = await realpath(candidate);
    if (!isPathInside(root, canonical)) {
      throw new ProjectError(
        "path-escape",
        `Resolved path escapes the project boundary: ${projectPath}`,
        projectPath,
      );
    }
  }
  return candidate;
}

export function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
