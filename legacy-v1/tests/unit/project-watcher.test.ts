import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  ProjectChangeFilter,
  shouldIgnoreProjectWatchPath,
} from "../../src/project/project-watcher.js";

describe("project watcher filtering", () => {
  it("ignores generated, dependency, metadata, and configured build paths", () => {
    const root = join("C:\\", "project");
    const ignored = [
      ".git/config",
      ".texpulse/project.json",
      "node_modules/pkg/index.js",
      "dist/main.js",
      "coverage/index.html",
      "custom-output/main.pdf",
    ];

    for (const path of ignored) {
      expect(shouldIgnoreProjectWatchPath(root, path, "custom-output")).toBe(
        true,
      );
    }
    expect(
      shouldIgnoreProjectWatchPath(root, "chapters/intro.tex", "custom-output"),
    ).toBe(false);
  });

  it("consumes an internal atomic write instead of reporting a rebuild trigger", async () => {
    const filter = new ProjectChangeFilter();
    const readVersion = vi.fn(() => Promise.resolve("b".repeat(64)));
    filter.recordInternalWrite("main.tex", "b".repeat(64));

    await expect(
      filter.shouldEmit({ path: "main.tex", kind: "changed" }, readVersion),
    ).resolves.toBe(false);
    await expect(
      filter.shouldEmit({ path: "main.tex", kind: "changed" }, readVersion),
    ).resolves.toBe(false);
    await expect(
      filter.shouldEmit({ path: "main.tex", kind: "changed" }, () =>
        Promise.resolve("c".repeat(64)),
      ),
    ).resolves.toBe(true);
  });

  it("still reports deletion or a different external version", async () => {
    const filter = new ProjectChangeFilter();
    filter.recordInternalWrite("main.tex", "a".repeat(64));
    await expect(
      filter.shouldEmit({ path: "main.tex", kind: "changed" }, () =>
        Promise.resolve("b".repeat(64)),
      ),
    ).resolves.toBe(true);

    filter.recordInternalWrite("main.tex", "b".repeat(64));
    await expect(
      filter.shouldEmit({ path: "main.tex", kind: "deleted" }, () =>
        Promise.resolve("b".repeat(64)),
      ),
    ).resolves.toBe(true);
  });
});
