import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { discoverExecutable } from "../../src/toolchain/executable-discovery.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("discoverExecutable", () => {
  it("prefers a custom Windows executable directory", async () => {
    const existing = new Set([
      "c:\\custom tools\\latexmk.exe",
      "c:\\path tools\\latexmk.exe",
    ]);

    const result = await discoverExecutable("latexmk", {
      customBinDirectory: "C:\\custom tools",
      pathValue: "C:\\path tools",
      pathExtensions: ".EXE;.CMD",
      platform: "win32",
      isExecutable: async (path) => existing.has(path.toLowerCase()),
    });

    expect(result?.toLowerCase()).toBe("c:\\custom tools\\latexmk.exe");
  });

  it("returns null when no candidate exists", async () => {
    const result = await discoverExecutable("latexmk", {
      pathValue: "C:\\missing",
      platform: "win32",
      isExecutable: async () => false,
    });

    expect(result).toBeNull();
  });

  it("accepts an existing absolute executable path", async () => {
    const result = await discoverExecutable("C:\\tools\\latexmk.exe", {
      platform: "win32",
      isExecutable: async (path) => path === "C:\\tools\\latexmk.exe",
    });

    expect(result).toBe("C:\\tools\\latexmk.exe");
  });

  it("uses the platform-specific POSIX PATH separator", async () => {
    const result = await discoverExecutable("latexmk", {
      pathValue: "/missing:/usr/local/bin",
      platform: "linux",
      isExecutable: async (path) => path === "/usr/local/bin/latexmk",
    });

    expect(result).toBe("/usr/local/bin/latexmk");
  });

  it("does not append PATHEXT when the command already has an extension", async () => {
    const visited: string[] = [];

    await discoverExecutable("latexmk.exe", {
      pathValue: "C:\\tools",
      pathExtensions: ".EXE;.CMD",
      platform: "win32",
      isExecutable: async (path) => {
        visited.push(path);
        return false;
      },
    });

    expect(visited).toEqual(["C:\\tools\\latexmk.exe"]);
  });

  it("checks duplicate directories only once", async () => {
    const visited: string[] = [];

    await discoverExecutable("latexmk", {
      customBinDirectory: "C:\\tools",
      pathValue: "C:\\tools",
      pathExtensions: ".EXE",
      platform: "win32",
      isExecutable: async (path) => {
        visited.push(path);
        return false;
      },
    });

    expect(visited).toEqual(["C:\\tools\\latexmk.exe"]);
  });

  it("requires the default filesystem candidate to be a file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "texpulse-discovery-"));
    const executable = join(directory, "tool");
    const nestedDirectory = join(directory, "not-a-tool");
    temporaryDirectories.push(directory);
    await writeFile(executable, "");
    await mkdir(nestedDirectory);

    await expect(discoverExecutable(executable)).resolves.toBe(executable);
    await expect(discoverExecutable(nestedDirectory)).resolves.toBeNull();
    await expect(
      discoverExecutable(join(directory, "missing")),
    ).resolves.toBeNull();
  });
});
