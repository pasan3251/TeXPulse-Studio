import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  truncate,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { SaveRecoveryRequest } from "../../src/ipc/recovery-contracts.js";
import {
  MAX_RECOVERY_FILE_BYTES,
  RecoveryStore,
  RecoveryStoreError,
} from "../../src/recovery/recovery-store.js";

const temporaryDirectories: string[] = [];
const projectId = "a".repeat(16);

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("RecoveryStore", () => {
  it("atomically stores, loads, and clears project-scoped editor content", async () => {
    const root = await mkdtemp(join(tmpdir(), "texpulse-recovery-"));
    temporaryDirectories.push(root);
    const store = new RecoveryStore(root);
    const request: SaveRecoveryRequest = {
      projectId,
      buffers: [
        {
          path: "main.tex",
          content: "unsaved content",
          version: "b".repeat(64),
        },
      ],
    };

    const saved = await store.save(request);
    await expect(store.load(projectId)).resolves.toEqual(saved);
    expect(
      await readFile(join(root, "recovery", `${projectId}.json`), "utf8"),
    ).toContain("unsaved content");
    await expect(store.clear(projectId)).resolves.toBe(true);
    await expect(store.load(projectId)).resolves.toBeNull();
  });

  it("rejects recovery data beyond the aggregate byte limit", async () => {
    const root = await mkdtemp(join(tmpdir(), "texpulse-recovery-limit-"));
    temporaryDirectories.push(root);
    const store = new RecoveryStore(root);

    await expect(
      store.save({
        projectId,
        buffers: Array.from({ length: 6 }, (_, index) => ({
          path: `chapter-${String(index)}.tex`,
          content: "x".repeat(2 * 1024 * 1024),
          version: "b".repeat(64),
        })),
      }),
    ).rejects.toBeInstanceOf(RecoveryStoreError);
  });

  it("enforces per-buffer byte limits for Unicode content", async () => {
    const root = await mkdtemp(join(tmpdir(), "texpulse-recovery-unicode-"));
    temporaryDirectories.push(root);
    const store = new RecoveryStore(root);

    await expect(
      store.save({
        projectId,
        buffers: [
          {
            path: "main.tex",
            content: "😀".repeat(600_000),
            version: "b".repeat(64),
          },
        ],
      }),
    ).rejects.toMatchObject({
      reason: "too-large",
    });
  });

  it("rejects malformed stored data and invalid project identities", async () => {
    const root = await mkdtemp(join(tmpdir(), "texpulse-recovery-invalid-"));
    temporaryDirectories.push(root);
    const store = new RecoveryStore(root);
    await mkdir(join(root, "recovery"));
    await writeFile(join(root, "recovery", `${projectId}.json`), "not-json");

    await expect(store.load(projectId)).rejects.toBeInstanceOf(
      RecoveryStoreError,
    );
    await writeFile(
      join(root, "recovery", `${projectId}.json`),
      JSON.stringify({}),
    );
    await expect(store.load(projectId)).rejects.toBeInstanceOf(
      RecoveryStoreError,
    );
    await writeFile(
      join(root, "recovery", `${projectId}.json`),
      JSON.stringify({
        schemaVersion: 1,
        projectId: "c".repeat(16),
        savedAt: "2026-06-14T00:00:00.000Z",
        buffers: [
          {
            path: "main.tex",
            content: "unsaved",
            version: "b".repeat(64),
          },
        ],
      }),
    );
    await expect(store.load(projectId)).rejects.toBeInstanceOf(
      RecoveryStoreError,
    );
    await expect(store.load("../escape")).rejects.toBeInstanceOf(
      RecoveryStoreError,
    );
  });

  it("clears all valid snapshots while ignoring unrelated files", async () => {
    const root = await mkdtemp(join(tmpdir(), "texpulse-recovery-clear-"));
    temporaryDirectories.push(root);
    const store = new RecoveryStore(root);
    const request = (id: string): SaveRecoveryRequest => ({
      projectId: id,
      buffers: [
        {
          path: "main.tex",
          content: "unsaved",
          version: "b".repeat(64),
        },
      ],
    });
    await store.save(request("a".repeat(16)));
    await store.save(request("c".repeat(16)));
    await writeFile(join(root, "recovery", "notes.txt"), "keep");

    await expect(store.clear("d".repeat(16))).resolves.toBe(false);
    await expect(store.clearAll()).resolves.toBe(2);
    await expect(
      readFile(join(root, "recovery", "notes.txt"), "utf8"),
    ).resolves.toBe("keep");
  });

  it("treats a missing recovery directory as already clear", async () => {
    const root = await mkdtemp(join(tmpdir(), "texpulse-recovery-empty-"));
    temporaryDirectories.push(root);
    const store = new RecoveryStore(root);

    await expect(store.clearAll()).resolves.toBe(0);
  });

  it("rejects an externally enlarged recovery file before reading it", async () => {
    const root = await mkdtemp(join(tmpdir(), "texpulse-recovery-file-limit-"));
    temporaryDirectories.push(root);
    const store = new RecoveryStore(root);
    const recoveryDirectory = join(root, "recovery");
    const path = join(recoveryDirectory, `${projectId}.json`);
    await mkdir(recoveryDirectory);
    await writeFile(path, "");
    await truncate(path, MAX_RECOVERY_FILE_BYTES + 1);

    await expect(store.load(projectId)).rejects.toMatchObject({
      reason: "too-large",
    });
  });

  it("rejects a non-file recovery entry", async () => {
    const root = await mkdtemp(join(tmpdir(), "texpulse-recovery-directory-"));
    temporaryDirectories.push(root);
    const store = new RecoveryStore(root);
    await mkdir(join(root, "recovery", `${projectId}.json`), {
      recursive: true,
    });

    await expect(store.load(projectId)).rejects.toMatchObject({
      reason: "invalid",
    });
  });
});
