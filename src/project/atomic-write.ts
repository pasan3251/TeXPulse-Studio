import { randomUUID } from "node:crypto";
import { link, open, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export interface AtomicWriteOptions {
  createOnly?: boolean;
  mode?: number;
}

export async function atomicWriteFile(
  targetPath: string,
  content: string,
  options: AtomicWriteOptions = {},
): Promise<void> {
  const directory = dirname(targetPath);
  const temporaryPath = join(
    directory,
    `.${basename(targetPath)}.${randomUUID()}.tmp`,
  );
  const handle = await open(
    temporaryPath,
    "wx",
    options.mode === undefined ? undefined : options.mode,
  );

  try {
    try {
      await handle.writeFile(content, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (options.createOnly === true) {
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
