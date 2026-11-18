import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LocalProjectStore, normalizeProjectPath } from "./project-store.js";
import { RecoveryService } from "./recovery-service.js";
import { exportProjectZipBuffer, importProjectZipBuffer } from "./zip-service.js";

describe("@texpulse/server project store", () => {
  it("rejects path traversal and reads/writes project files atomically", async () => {
    expect(() => normalizeProjectPath("../secret.tex")).toThrow();
    const root = await mkdtemp(join(tmpdir(), "texpulse-server-"));
    try {
      const store = await LocalProjectStore.open(root);
      await store.writeProjectFile("main.tex", "\\documentclass{article}\n");
      const files = await store.listTextFiles();
      expect(files).toHaveLength(1);
      expect(files[0]?.path).toBe("main.tex");
      expect(files[0]?.content).toContain("\\documentclass{article}");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("saves, loads, and clears atomic crash recovery snapshots", async () => {
    const root = await mkdtemp(join(tmpdir(), "texpulse-recovery-"));
    try {
      const recovery = new RecoveryService(root);
      expect(await recovery.load()).toBeNull();

      await recovery.save({
        activeFilePath: "chapters/methodology.tex",
        buffers: [
          {
            path: "chapters/methodology.tex",
            content: "\\section{Draft}\nUnsaved line",
            lastModified: 123456,
          },
        ],
      });

      const loaded = await recovery.load();
      expect(loaded?.activeFilePath).toBe("chapters/methodology.tex");
      expect(loaded?.buffers).toHaveLength(1);
      expect(loaded?.buffers[0]?.content).toContain("Unsaved line");

      expect(await recovery.clear()).toBe(true);
      expect(await recovery.load()).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("exports an Overleaf-compatible .zip excluding cache dirs and imports cleanly into another project", async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), "texpulse-zip-src-"));
    const destRoot = await mkdtemp(join(tmpdir(), "texpulse-zip-dst-"));
    try {
      const srcStore = await LocalProjectStore.open(sourceRoot);
      await srcStore.writeProjectFile("main.tex", "\\documentclass{article}\n\\begin{document}\nZip ok.\n\\end{document}\n");
      await srcStore.writeProjectFile("chapters/intro.tex", "\\section{Intro}\n");
      await mkdir(join(sourceRoot, ".texpulse-cache"), { recursive: true });
      await writeFile(join(sourceRoot, ".texpulse-cache", "preamble_cache.fmt"), "huge-binary-cache");

      const zipBuf = await exportProjectZipBuffer(sourceRoot);
      const dstStore = await LocalProjectStore.open(destRoot);
      const imported = await importProjectZipBuffer(dstStore, zipBuf);

      expect(imported.importedPaths.sort()).toEqual(["chapters/intro.tex", "main.tex"]);
      const dstFiles = await dstStore.listTextFiles();
      expect(dstFiles.map((f) => f.path)).toEqual(["chapters/intro.tex", "main.tex"]);
      expect(dstFiles.find((f) => f.path === "main.tex")?.content).toContain("Zip ok.");
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
      await rm(destRoot, { recursive: true, force: true });
    }
  });
});
