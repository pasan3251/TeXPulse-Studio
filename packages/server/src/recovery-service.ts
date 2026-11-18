import { open, unlink } from "node:fs/promises";
import { join } from "node:path";
import type {
  RecoveryBufferSnapshot,
  RecoverySnapshotPayload,
} from "@texpulse/shared";
import { atomicWriteFile, normalizeProjectPath } from "./project-store.js";

const MAX_RECOVERY_BUFFER_BYTES = 10 * 1024 * 1024;
const MAX_RECOVERY_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_RECOVERY_BUFFERS = 500;

/**
 * Atomic crash-recovery snapshot store persisted in `.texpulse/recovery.json`.
 */
export class RecoveryService {
  private readonly snapshotFile: string;

  constructor(projectRoot: string) {
    this.snapshotFile = join(projectRoot, ".texpulse", "recovery.json");
  }

  async save(input: {
    activeFilePath: string;
    buffers: readonly RecoveryBufferSnapshot[];
  }): Promise<RecoverySnapshotPayload> {
    if (input.buffers.length > MAX_RECOVERY_BUFFERS) {
      throw new Error("Recovery snapshot exceeds buffer count limit.");
    }

    let totalBytes = 0;
    const sanitized: RecoveryBufferSnapshot[] = [];
    for (const buf of input.buffers) {
      const normalizedPath = normalizeProjectPath(buf.path);
      const byteLength = Buffer.byteLength(buf.content, "utf8");
      if (byteLength > MAX_RECOVERY_BUFFER_BYTES) {
        throw new Error(`Recovery buffer exceeds size limit: ${normalizedPath}`);
      }
      totalBytes += byteLength;
      if (totalBytes > MAX_RECOVERY_TOTAL_BYTES) {
        throw new Error("Total recovery snapshot size exceeds 64 MiB limit.");
      }
      sanitized.push({
        path: normalizedPath,
        content: buf.content,
        lastModified: Number.isFinite(buf.lastModified) ? buf.lastModified : Date.now(),
      });
    }

    const payload: RecoverySnapshotPayload = {
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      activeFilePath: normalizeProjectPath(input.activeFilePath || "main.tex"),
      buffers: sanitized,
    };

    await atomicWriteFile(this.snapshotFile, `${JSON.stringify(payload, null, 2)}\n`);
    return payload;
  }

  async load(): Promise<RecoverySnapshotPayload | null> {
    let raw: string;
    try {
      const handle = await open(this.snapshotFile, "r");
      try {
        const info = await handle.stat();
        if (!info.isFile() || info.size > MAX_RECOVERY_TOTAL_BYTES) {
          return null;
        }
        const buf = Buffer.alloc(info.size);
        const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
        raw = buf.subarray(0, bytesRead).toString("utf8");
      } finally {
        await handle.close();
      }
    } catch {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<RecoverySnapshotPayload>;
      if (
        parsed.schemaVersion !== 1 ||
        typeof parsed.activeFilePath !== "string" ||
        !Array.isArray(parsed.buffers)
      ) {
        return null;
      }
      const buffers: RecoveryBufferSnapshot[] = [];
      for (const item of parsed.buffers) {
        if (
          item &&
          typeof item.path === "string" &&
          typeof item.content === "string" &&
          typeof item.lastModified === "number"
        ) {
          buffers.push({
            path: normalizeProjectPath(item.path),
            content: item.content,
            lastModified: item.lastModified,
          });
        }
      }
      return {
        schemaVersion: 1,
        savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date().toISOString(),
        activeFilePath: normalizeProjectPath(parsed.activeFilePath),
        buffers,
      };
    } catch {
      return null;
    }
  }

  async clear(): Promise<boolean> {
    try {
      await unlink(this.snapshotFile);
      return true;
    } catch {
      return false;
    }
  }
}
