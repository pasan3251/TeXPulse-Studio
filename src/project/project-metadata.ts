import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

import { atomicWriteFile } from "./atomic-write.js";
import {
  canonicalProjectRoot,
  normalizeProjectPath,
  resolveProjectPath,
} from "./project-paths.js";
import type {
  CompileRecipe,
  MetadataLoadResult,
  ProjectMetadata,
} from "./project-types.js";

const METADATA_RELATIVE_PATH = ".texpulse/project.json";
const RECIPES = new Set<CompileRecipe>([
  "latexmk-pdf",
  "latexmk-xelatex",
  "latexmk-lualatex",
]);

export function defaultProjectMetadata(
  rootFile: string | null = null,
): ProjectMetadata {
  return {
    schemaVersion: 1,
    rootFile,
    recipe: "latexmk-pdf",
    buildDirectory: ".texpulse/build",
    autoBuild: true,
  };
}

export function parseProjectMetadata(
  value: unknown,
  fallbackRootFile: string | null = null,
): MetadataLoadResult {
  const fallback = defaultProjectMetadata(fallbackRootFile);
  const issues: string[] = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      metadata: fallback,
      issues: ["Project metadata must be a JSON object."],
      source: "default",
    };
  }

  const record = value as Record<string, unknown>;
  const metadata = { ...fallback };
  if (record.schemaVersion !== 1) {
    return {
      metadata: fallback,
      issues: ["Unsupported or missing project metadata schemaVersion."],
      source: "default",
    };
  }

  if (record.rootFile === null) {
    metadata.rootFile = null;
  } else if (typeof record.rootFile === "string") {
    try {
      const rootFile = normalizeProjectPath(record.rootFile);
      if (!rootFile.toLowerCase().endsWith(".tex")) {
        issues.push("rootFile must identify a .tex file.");
      } else {
        metadata.rootFile = rootFile;
      }
    } catch {
      issues.push("rootFile must be a relative project path.");
    }
  } else {
    issues.push("rootFile must be a string or null.");
  }

  if (
    typeof record.recipe === "string" &&
    RECIPES.has(record.recipe as CompileRecipe)
  ) {
    metadata.recipe = record.recipe as CompileRecipe;
  } else {
    issues.push("recipe is not supported.");
  }

  if (typeof record.buildDirectory === "string") {
    try {
      metadata.buildDirectory = normalizeProjectPath(record.buildDirectory);
    } catch {
      issues.push("buildDirectory must be a relative project path.");
    }
  } else {
    issues.push("buildDirectory must be a string.");
  }

  if (typeof record.autoBuild === "boolean") {
    metadata.autoBuild = record.autoBuild;
  } else {
    issues.push("autoBuild must be a boolean.");
  }

  return { metadata, issues, source: "file" };
}

export async function loadProjectMetadata(
  projectRoot: string,
  fallbackRootFile: string | null = null,
): Promise<MetadataLoadResult> {
  const canonicalRoot = await canonicalProjectRoot(projectRoot);
  const metadataPath = await resolveProjectPath(
    canonicalRoot,
    METADATA_RELATIVE_PATH,
    { allowMissing: true },
  );
  let raw: string;
  try {
    raw = await readFile(metadataPath, "utf8");
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return {
        metadata: defaultProjectMetadata(fallbackRootFile),
        issues: [],
        source: "default",
      };
    }
    throw error;
  }

  try {
    return parseProjectMetadata(JSON.parse(raw), fallbackRootFile);
  } catch {
    return {
      metadata: defaultProjectMetadata(fallbackRootFile),
      issues: ["Project metadata is not valid JSON."],
      source: "default",
    };
  }
}

export async function saveProjectMetadata(
  projectRoot: string,
  metadata: ProjectMetadata,
): Promise<void> {
  const parsed = parseProjectMetadata(metadata);
  if (parsed.issues.length > 0) {
    throw new Error(`Invalid project metadata: ${parsed.issues.join(" ")}`);
  }

  const canonicalRoot = await canonicalProjectRoot(projectRoot);
  const metadataPath = await resolveProjectPath(
    canonicalRoot,
    METADATA_RELATIVE_PATH,
    { allowMissing: true },
  );
  await mkdir(dirname(metadataPath), { recursive: true });
  await atomicWriteFile(
    metadataPath,
    `${JSON.stringify(parsed.metadata, null, 2)}\n`,
  );
}
