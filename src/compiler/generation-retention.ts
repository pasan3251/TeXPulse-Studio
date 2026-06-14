import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { removeGeneratedOutput } from "./output-limits.js";

export const MAX_RETAINED_BUILD_GENERATIONS = 8;
const GENERATION_DIRECTORY_PATTERN =
  /^([1-9]\d*)-([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/iu;

export async function pruneGenerationDirectories(
  generationsRoot: string,
  preserveNames: ReadonlySet<string>,
  maxRetained = MAX_RETAINED_BUILD_GENERATIONS,
): Promise<number> {
  if (!Number.isSafeInteger(maxRetained) || maxRetained < 1) {
    throw new Error("Generation retention must be a positive safe integer.");
  }
  const entries = await readdir(generationsRoot, {
    withFileTypes: true,
  }).catch((error: unknown) => {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return [];
    }
    throw error;
  });
  const generations = entries
    .flatMap((entry) => {
      const match = GENERATION_DIRECTORY_PATTERN.exec(entry.name);
      if (!entry.isDirectory() || entry.isSymbolicLink() || match === null) {
        return [];
      }
      const generation = Number.parseInt(match[1]!, 10);
      return Number.isSafeInteger(generation)
        ? [{ name: entry.name, generation }]
        : [];
    })
    .sort((left, right) => right.generation - left.generation);
  const keep = new Set(
    [...preserveNames].filter((name) =>
      generations.some((generation) => generation.name === name),
    ),
  );
  for (const generation of generations) {
    if (keep.size >= maxRetained) {
      break;
    }
    keep.add(generation.name);
  }
  const remove = generations.filter((generation) => !keep.has(generation.name));
  await Promise.all(
    remove.map((generation) =>
      removeGeneratedOutput(join(generationsRoot, generation.name)),
    ),
  );
  return remove.length;
}
