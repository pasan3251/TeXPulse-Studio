import { mkdir, open, readdir, rm, unlink } from "node:fs/promises";
import { join } from "node:path";

import { atomicWriteFile } from "../project/atomic-write.js";
import {
  MAX_RECOVERY_BUFFER_BYTES,
  MAX_RECOVERY_TOTAL_BYTES,
  recoverySnapshotSchema,
  type RecoverySnapshot,
  type SaveRecoveryRequest,
} from "../ipc/recovery-contracts.js";

export const MAX_RECOVERY_FILE_BYTES = 64 * 1024 * 1024;

export class RecoveryStoreError extends Error {
  constructor(
    readonly reason: "invalid" | "too-large",
    message: string,
  ) {
    super(message);
    this.name = "RecoveryStoreError";
  }
}

export class RecoveryStore {
  private readonly directory: string;

  constructor(userDataDirectory: string) {
    this.directory = join(userDataDirectory, "recovery");
  }

  async save(request: SaveRecoveryRequest): Promise<RecoverySnapshot> {
    validateRecoveryBytes(request.buffers);
    const snapshot = recoverySnapshotSchema.parse({
      schemaVersion: 1,
      projectId: request.projectId,
      savedAt: new Date().toISOString(),
      buffers: request.buffers,
    });
    const serialized = `${JSON.stringify(snapshot)}\n`;
    if (Buffer.byteLength(serialized, "utf8") > MAX_RECOVERY_FILE_BYTES) {
      throw new RecoveryStoreError(
        "too-large",
        `Recovery storage exceeds the ${String(MAX_RECOVERY_FILE_BYTES)} byte file limit.`,
      );
    }
    await mkdir(this.directory, { recursive: true });
    await atomicWriteFile(this.snapshotPath(request.projectId), serialized);
    return snapshot;
  }

  async load(projectId: string): Promise<RecoverySnapshot | null> {
    let raw: string;
    try {
      raw = await readBoundedRecoveryFile(this.snapshotPath(projectId));
    } catch (error) {
      if (isMissing(error)) {
        return null;
      }
      throw error;
    }
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new RecoveryStoreError(
        "invalid",
        "Stored recovery data was not valid JSON.",
      );
    }
    const parsed = recoverySnapshotSchema.safeParse(value);
    if (!parsed.success || parsed.data.projectId !== projectId) {
      throw new RecoveryStoreError(
        "invalid",
        "Stored recovery data was invalid.",
      );
    }
    validateRecoveryBytes(parsed.data.buffers);
    return parsed.data;
  }

  async clear(projectId: string): Promise<boolean> {
    try {
      await unlink(this.snapshotPath(projectId));
      return true;
    } catch (error) {
      if (isMissing(error)) {
        return false;
      }
      throw error;
    }
  }

  async clearAll(): Promise<number> {
    const entries = await readdir(this.directory, {
      withFileTypes: true,
    }).catch((error: unknown) => {
      if (isMissing(error)) {
        return [];
      }
      throw error;
    });
    const snapshots = entries.filter(
      (entry) => entry.isFile() && /^[a-f0-9]{16}\.json$/u.test(entry.name),
    );
    await Promise.all(
      snapshots.map((entry) =>
        rm(join(this.directory, entry.name), { force: true }),
      ),
    );
    return snapshots.length;
  }

  private snapshotPath(projectId: string): string {
    if (!/^[a-f0-9]{16}$/u.test(projectId)) {
      throw new RecoveryStoreError(
        "invalid",
        "Recovery project identity was invalid.",
      );
    }
    return join(this.directory, `${projectId}.json`);
  }
}

async function readBoundedRecoveryFile(path: string): Promise<string> {
  const handle = await open(path, "r");
  try {
    const fileStat = await handle.stat();
    if (!fileStat.isFile()) {
      throw new RecoveryStoreError(
        "invalid",
        "Stored recovery data was not a regular file.",
      );
    }
    if (fileStat.size > MAX_RECOVERY_FILE_BYTES) {
      throw new RecoveryStoreError(
        "too-large",
        `Stored recovery data exceeds the ${String(MAX_RECOVERY_FILE_BYTES)} byte file limit.`,
      );
    }
    const buffer = Buffer.alloc(fileStat.size + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > MAX_RECOVERY_FILE_BYTES) {
      throw new RecoveryStoreError(
        "too-large",
        `Stored recovery data exceeds the ${String(MAX_RECOVERY_FILE_BYTES)} byte file limit.`,
      );
    }
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

function validateRecoveryBytes(buffers: readonly { content: string }[]): void {
  let totalBytes = 0;
  for (const buffer of buffers) {
    const bytes = Buffer.byteLength(buffer.content, "utf8");
    if (bytes > MAX_RECOVERY_BUFFER_BYTES) {
      throw new RecoveryStoreError(
        "too-large",
        `A recovery buffer exceeds the ${String(MAX_RECOVERY_BUFFER_BYTES)} byte limit.`,
      );
    }
    totalBytes += bytes;
  }
  if (totalBytes > MAX_RECOVERY_TOTAL_BYTES) {
    throw new RecoveryStoreError(
      "too-large",
      `Recovery content exceeds the ${String(MAX_RECOVERY_TOTAL_BYTES)} byte limit.`,
    );
  }
}

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
