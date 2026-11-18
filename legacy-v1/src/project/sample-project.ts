import { constants } from "node:fs";
import { copyFile, lstat, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const SAMPLE_FILES = ["main.tex"] as const;

export async function ensureSampleProject(
  sourceDirectory: string,
  targetDirectory: string,
): Promise<string> {
  await ensureDirectory(targetDirectory);

  for (const fileName of SAMPLE_FILES) {
    const sourcePath = join(sourceDirectory, fileName);
    const sourceStat = await lstat(sourcePath);
    if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
      throw new Error(`Bundled sample file is invalid: ${fileName}`);
    }

    const targetPath = join(targetDirectory, fileName);
    const existing = await optionalStat(targetPath);
    if (existing !== null) {
      assertSafeFile(existing, fileName);
      continue;
    }

    await copyFile(sourcePath, targetPath, constants.COPYFILE_EXCL).catch(
      async (error: unknown) => {
        if (!hasCode(error, "EEXIST")) {
          throw error;
        }
        const concurrentTarget = await lstat(targetPath);
        assertSafeFile(concurrentTarget, fileName);
      },
    );
  }

  return targetDirectory;
}

export async function createProjectFromTemplate(
  sourceDirectory: string,
  targetDirectory: string,
): Promise<string> {
  const existing = await optionalStat(targetDirectory);
  if (existing !== null) {
    throw new Error("The selected project location already exists.");
  }

  await mkdir(targetDirectory);
  try {
    for (const fileName of SAMPLE_FILES) {
      const sourcePath = join(sourceDirectory, fileName);
      const sourceStat = await lstat(sourcePath);
      if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
        throw new Error(`Bundled project template is invalid: ${fileName}`);
      }
      await copyFile(
        sourcePath,
        join(targetDirectory, fileName),
        constants.COPYFILE_EXCL,
      );
    }
  } catch (error) {
    await rm(targetDirectory, { recursive: true, force: true });
    throw error;
  }
  return targetDirectory;
}

function optionalStat(path: string) {
  return lstat(path).catch((error: unknown) => {
    if (hasCode(error, "ENOENT")) {
      return null;
    }
    throw error;
  });
}

function assertSafeFile(
  stat: Awaited<ReturnType<typeof lstat>>,
  fileName: string,
): void {
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Sample destination is invalid: ${fileName}`);
  }
}

async function ensureDirectory(path: string): Promise<void> {
  const existing = await optionalStat(path);
  if (existing !== null) {
    if (!existing.isDirectory() || existing.isSymbolicLink()) {
      throw new Error("Sample project destination is not a safe directory.");
    }
    return;
  }
  await mkdir(path, { recursive: true });
  const created = await lstat(path);
  if (!created.isDirectory() || created.isSymbolicLink()) {
    throw new Error("Sample project destination is not a safe directory.");
  }
}

function hasCode(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    Reflect.get(error, "code") === code
  );
}
