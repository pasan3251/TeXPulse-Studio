import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { GlobalSettingsStore } from "../../src/settings/global-settings.js";
import { defaultGlobalSettings } from "../../src/settings/settings-types.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("GlobalSettingsStore", () => {
  it("loads defaults, atomically saves, and reloads current settings", async () => {
    const directory = await mkdtemp(join(tmpdir(), "texpulse-settings-"));
    temporaryDirectories.push(directory);
    const store = new GlobalSettingsStore(directory);

    await expect(store.load()).resolves.toEqual({
      settings: defaultGlobalSettings(),
      issues: [],
      source: "default",
    });
    const settings = {
      ...defaultGlobalSettings(),
      setupCompleted: true,
      editorFontSize: 18,
    };
    await expect(store.save(settings)).resolves.toEqual(settings);
    await expect(store.load()).resolves.toEqual({
      settings,
      issues: [],
      source: "file",
    });
    await expect(
      readFile(join(directory, "settings.json"), "utf8"),
    ).resolves.toContain('"editorFontSize": 18');
  });

  it("recovers malformed JSON and migrates a legacy file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "texpulse-settings-"));
    temporaryDirectories.push(directory);
    const settingsPath = join(directory, "settings.json");
    const store = new GlobalSettingsStore(directory);
    await writeFile(settingsPath, "{broken");

    await expect(store.load()).resolves.toMatchObject({
      source: "default",
      issues: [expect.stringContaining("not valid JSON")],
    });

    await writeFile(
      settingsPath,
      JSON.stringify({
        schemaVersion: 0,
        debounceMs: 1200,
        toolchain: { customBinDirectory: "C:\\Tools" },
      }),
    );
    await expect(store.load()).resolves.toMatchObject({
      source: "file",
      settings: {
        schemaVersion: 1,
        debounceMs: 1200,
        customBinDirectory: "C:\\Tools",
      },
      issues: [expect.stringContaining("migrated")],
    });
  });

  it("preserves the settings schema shipped by the previous beta", async () => {
    const directory = await mkdtemp(join(tmpdir(), "texpulse-settings-"));
    temporaryDirectories.push(directory);
    const settings = {
      ...defaultGlobalSettings(),
      autosave: false,
      debounceMs: 1200,
      editorFontSize: 18,
      pdfZoomMode: "fit-page" as const,
      setupCompleted: true,
    };
    await writeFile(
      join(directory, "settings.json"),
      `${JSON.stringify(settings, null, 2)}\n`,
    );

    await expect(new GlobalSettingsStore(directory).load()).resolves.toEqual({
      settings,
      issues: [],
      source: "file",
    });
  });

  it("does not hide unexpected settings read failures", async () => {
    const directory = await mkdtemp(join(tmpdir(), "texpulse-settings-"));
    temporaryDirectories.push(directory);
    await mkdir(join(directory, "settings.json"));

    await expect(new GlobalSettingsStore(directory).load()).rejects.toThrow();
  });
});
