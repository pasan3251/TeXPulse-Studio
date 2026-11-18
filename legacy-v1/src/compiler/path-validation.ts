import { realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

function isInside(parent: string, candidate: string): boolean {
  const relativePath = relative(parent, candidate);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  );
}

export interface ValidatedCompilePaths {
  projectDirectory: string;
  rootFile: string;
  buildDirectory: string;
}

async function resolveThroughExistingAncestor(path: string): Promise<string> {
  let ancestor = path;

  while (true) {
    try {
      const realAncestor = await realpath(ancestor);
      return resolve(realAncestor, relative(ancestor, path));
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "ENOENT"
      ) {
        throw error;
      }

      const parent = dirname(ancestor);
      if (parent === ancestor) {
        throw error;
      }
      ancestor = parent;
    }
  }
}

export async function validateCompilePaths(
  projectDirectory: string,
  rootFile: string,
  buildDirectory: string,
): Promise<ValidatedCompilePaths> {
  const realProjectDirectory = await realpath(resolve(projectDirectory));
  const projectStat = await stat(realProjectDirectory);

  if (!projectStat.isDirectory()) {
    throw new Error("Project path must be a directory.");
  }

  const requestedRoot = resolve(realProjectDirectory, rootFile);
  const realRootFile = await realpath(requestedRoot);
  const rootStat = await stat(realRootFile);

  if (!rootStat.isFile()) {
    throw new Error("Root file must be a regular file.");
  }
  if (!isInside(realProjectDirectory, realRootFile)) {
    throw new Error("Root file must remain inside the project directory.");
  }
  if (!realRootFile.toLowerCase().endsWith(".tex")) {
    throw new Error("Root file must have a .tex extension.");
  }

  const resolvedBuildDirectory = resolve(realProjectDirectory, buildDirectory);
  if (
    resolvedBuildDirectory === realProjectDirectory ||
    !isInside(realProjectDirectory, resolvedBuildDirectory)
  ) {
    throw new Error(
      "Build directory must be a child of the project directory.",
    );
  }
  const projectedRealBuildDirectory = await resolveThroughExistingAncestor(
    resolvedBuildDirectory,
  );
  if (!isInside(realProjectDirectory, projectedRealBuildDirectory)) {
    throw new Error(
      "Build directory resolves outside the project directory through a filesystem link.",
    );
  }

  return {
    projectDirectory: realProjectDirectory,
    rootFile: realRootFile,
    buildDirectory: resolvedBuildDirectory,
  };
}
