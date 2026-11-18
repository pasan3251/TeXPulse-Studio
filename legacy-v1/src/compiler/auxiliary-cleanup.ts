import { lstat, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

import {
  canonicalProjectRoot,
  normalizeProjectPath,
  resolveProjectPath,
} from "../project/project-paths.js";
import { ProjectError } from "../project/project-types.js";

const AUXILIARY_SUFFIXES = [
  ".aux",
  ".bbl",
  ".bcf",
  ".blg",
  ".fdb_latexmk",
  ".fls",
  ".lof",
  ".lot",
  ".nav",
  ".out",
  ".run.xml",
  ".snm",
  ".toc",
  ".vrb",
  ".xdv",
] as const;

export async function cleanupAuxiliaryFiles(
  projectRoot: string,
  buildDirectory: string,
): Promise<number> {
  const canonicalRoot = await canonicalProjectRoot(projectRoot);
  const generationsPath = `${normalizeProjectPath(buildDirectory)}/generations`;
  let generationsDirectory: string;
  try {
    generationsDirectory = await resolveProjectPath(
      canonicalRoot,
      generationsPath,
    );
  } catch (error) {
    if (error instanceof ProjectError && error.code === "not-found") {
      return 0;
    }
    throw error;
  }

  return cleanupDirectory(generationsDirectory);
}

async function cleanupDirectory(directory: string): Promise<number> {
  let removedFiles = 0;
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    const entryStat = await lstat(path);
    if (entryStat.isSymbolicLink()) {
      continue;
    }
    if (entryStat.isDirectory()) {
      removedFiles += await cleanupDirectory(path);
      continue;
    }
    const lowerName = entry.name.toLowerCase();
    if (AUXILIARY_SUFFIXES.some((suffix) => lowerName.endsWith(suffix))) {
      await rm(path);
      removedFiles += 1;
    }
  }
  return removedFiles;
}
