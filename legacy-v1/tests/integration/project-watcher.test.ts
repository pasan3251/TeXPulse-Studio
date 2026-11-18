import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ProjectWatcher,
  type ProjectWatchChange,
} from "../../src/project/project-watcher.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("ProjectWatcher", () => {
  it("reports external source changes and ignores generated output", async () => {
    const root = await mkdtemp(join(tmpdir(), "texpulse-watch-"));
    temporaryDirectories.push(root);
    await writeFile(join(root, "main.tex"), "before");
    await mkdir(join(root, ".texpulse", "build"), { recursive: true });

    let ready!: () => void;
    const readyPromise = new Promise<void>((resolve) => {
      ready = resolve;
    });
    let changed!: (change: ProjectWatchChange) => void;
    const changedPromise = new Promise<ProjectWatchChange>((resolve) => {
      changed = resolve;
    });
    const watcher = new ProjectWatcher({
      root,
      buildDirectory: ".texpulse/build",
      onChange: changed,
      onReady: ready,
      readVersion: () => Promise.resolve("external"),
    });

    try {
      await readyPromise;
      await writeFile(
        join(root, ".texpulse", "build", "main.pdf"),
        "generated",
      );
      await writeFile(join(root, "main.tex"), "after");

      await expect(changedPromise).resolves.toEqual({
        path: "main.tex",
        kind: "changed",
      });
    } finally {
      await watcher.close();
    }
  });
});
