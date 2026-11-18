import { lstat, readdir, rmdir, unlink } from "node:fs/promises";
import { join } from "node:path";

export interface GeneratedOutputLimits {
  maxFileBytes: number;
  maxFiles: number;
  maxTotalBytes: number;
}

export const DEFAULT_GENERATED_OUTPUT_LIMITS: GeneratedOutputLimits = {
  maxFileBytes: 128 * 1024 * 1024,
  maxFiles: 4_096,
  maxTotalBytes: 512 * 1024 * 1024,
};

export interface GeneratedOutputInspection {
  files: number;
  totalBytes: number;
  violation: string | null;
}

export async function inspectGeneratedOutput(
  root: string,
  limits: GeneratedOutputLimits = DEFAULT_GENERATED_OUTPUT_LIMITS,
): Promise<GeneratedOutputInspection> {
  validateLimits(limits);
  const pending = [root];
  let files = 0;
  let totalBytes = 0;

  while (pending.length > 0) {
    const directory = pending.pop()!;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        return {
          files,
          totalBytes,
          violation: "Generated output contained a filesystem link.",
        };
      }
      if (entry.isDirectory()) {
        pending.push(path);
        continue;
      }
      const fileStat = await lstat(path);
      if (!fileStat.isFile()) {
        return {
          files,
          totalBytes,
          violation: "Generated output contained a non-regular file.",
        };
      }
      files += 1;
      totalBytes += fileStat.size;
      if (files > limits.maxFiles) {
        return {
          files,
          totalBytes,
          violation: `Generated output exceeded ${String(limits.maxFiles)} files.`,
        };
      }
      if (fileStat.size > limits.maxFileBytes) {
        return {
          files,
          totalBytes,
          violation: `A generated file exceeded ${String(limits.maxFileBytes)} bytes.`,
        };
      }
      if (totalBytes > limits.maxTotalBytes) {
        return {
          files,
          totalBytes,
          violation: `Generated output exceeded ${String(limits.maxTotalBytes)} total bytes.`,
        };
      }
    }
  }

  return { files, totalBytes, violation: null };
}

export async function removeGeneratedOutput(root: string): Promise<void> {
  const entries = await readdir(root, { withFileTypes: true }).catch(
    (error: unknown) => {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return [];
      }
      throw error;
    },
  );
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      await removeGeneratedOutput(path);
    } else {
      await unlink(path);
    }
  }
  await rmdir(root).catch((error: unknown) => {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw error;
    }
  });
}

function validateLimits(limits: GeneratedOutputLimits): void {
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`${name} must be a positive safe integer.`);
    }
  }
}
