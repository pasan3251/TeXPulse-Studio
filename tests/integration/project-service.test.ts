import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { saveProjectMetadata } from "../../src/project/project-metadata.js";
import { ProjectService } from "../../src/project/project-service.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function createProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "texpulse-project-"));
  temporaryDirectories.push(root);
  return root;
}

describe("ProjectService", () => {
  it("supports Unicode and spaces through the CRUD lifecycle", async () => {
    const root = await createProject();
    const service = await ProjectService.open(root);
    await service.createDirectory("chapters and notes");
    const created = await service.createTextFile(
      "chapters and notes/ආයුබෝවන්.tex",
      "Hello λ",
    );
    expect(created.content).toBe("Hello λ");

    const updated = await service.writeTextFile(
      created.path,
      "Updated ✓",
      created.version,
    );
    expect(updated.content).toBe("Updated ✓");
    await service.renameEntry(
      created.path,
      "chapters and notes/renamed.tex",
      updated.version,
    );
    await service.deleteEntry("chapters and notes/renamed.tex", {
      expectedVersion: updated.version,
    });
    await service.deleteEntry("chapters and notes");
    await expect(service.readTextFile(created.path)).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("does not enumerate build artifacts below ignored directories", async () => {
    const root = await createProject();
    await mkdir(join(root, "build"), { recursive: true });
    await mkdir(join(root, "node_modules", "package"), { recursive: true });
    await writeFile(join(root, "main.tex"), "\\documentclass{article}");
    await writeFile(join(root, "build", "main.pdf"), "pdf");
    await writeFile(
      join(root, "node_modules", "package", "index.js"),
      "module",
    );
    await saveProjectMetadata(root, {
      schemaVersion: 1,
      rootFile: "main.tex",
      recipe: "latexmk-pdf",
      buildDirectory: process.platform === "win32" ? "BUILD" : "build",
      autoBuild: true,
    });
    const service = await ProjectService.open(root);

    const entries = await service.listEntries();
    expect(entries.map((entry) => entry.path)).toEqual([
      ".texpulse",
      "build",
      "main.tex",
      "node_modules",
    ]);
  });

  it("detects external edits and refuses stale writes", async () => {
    const root = await createProject();
    const path = join(root, "main.tex");
    await writeFile(path, "first");
    const service = await ProjectService.open(root);
    const snapshot = await service.readTextFile("main.tex");

    await writeFile(path, "external");
    await expect(
      service.checkTextFile("main.tex", snapshot.version),
    ).resolves.toBe("changed");
    await expect(
      service.writeTextFile("main.tex", "editor", snapshot.version),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(readFile(path, "utf8")).resolves.toBe("external");
  });

  it("reports external deletion", async () => {
    const root = await createProject();
    const path = join(root, "main.tex");
    await writeFile(path, "first");
    const service = await ProjectService.open(root);
    const snapshot = await service.readTextFile("main.tex");
    await rm(path);
    await expect(
      service.checkTextFile("main.tex", snapshot.version),
    ).resolves.toBe("deleted");
  });

  it("fails explicitly for read-only files", async () => {
    const root = await createProject();
    const path = join(root, "main.tex");
    await writeFile(path, "first");
    const service = await ProjectService.open(root);
    const snapshot = await service.readTextFile("main.tex");
    await chmod(path, 0o444);

    await expect(
      service.writeTextFile("main.tex", "second", snapshot.version),
    ).rejects.toMatchObject({ code: "read-only" });
    await chmod(path, 0o666);
  });

  it("detects likely roots without reading ignored build output", async () => {
    const root = await createProject();
    await mkdir(join(root, ".texpulse", "build"), { recursive: true });
    await writeFile(
      join(root, "main.tex"),
      "\\documentclass{article}\\begin{document}Hi\\end{document}",
    );
    await writeFile(
      join(root, ".texpulse", "build", "generated.tex"),
      "\\documentclass{article}",
    );
    const service = await ProjectService.open(root);

    await expect(service.detectRootFiles()).resolves.toMatchObject([
      { path: "main.tex", score: 160 },
    ]);
  });

  it("lists a .texpulse junction without traversing it for metadata", async () => {
    const root = await createProject();
    const outside = await createProject();
    await writeFile(join(outside, "project.json"), "{}");
    try {
      await symlink(
        outside,
        join(root, ".texpulse"),
        process.platform === "win32" ? "junction" : "dir",
      );
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        ["EPERM", "EACCES"].includes(
          (error as NodeJS.ErrnoException).code ?? "",
        )
      ) {
        return;
      }
      throw error;
    }

    const service = await ProjectService.open(root);
    await expect(service.listEntries()).resolves.toMatchObject([
      { path: ".texpulse", kind: "link" },
    ]);
  });
});
