import { describe, expect, it } from "vitest";

import { parseGlobalSettings } from "../../src/settings/global-settings.js";
import { defaultGlobalSettings } from "../../src/settings/settings-types.js";

describe("global settings", () => {
  it("accepts the current schema", () => {
    const settings = {
      ...defaultGlobalSettings(),
      setupCompleted: true,
      customBinDirectory: "C:\\MiKTeX\\bin",
      editorFontSize: 17,
    };

    expect(parseGlobalSettings(settings)).toEqual({
      settings,
      issues: [],
      source: "file",
    });
  });

  it("migrates the legacy nested toolchain schema", () => {
    expect(
      parseGlobalSettings({
        schemaVersion: 0,
        autosave: false,
        autoBuild: false,
        debounceMs: 1200,
        compileTimeoutMs: 180000,
        toolchain: { customBinDirectory: "C:\\Tools" },
      }),
    ).toMatchObject({
      settings: {
        schemaVersion: 1,
        autosave: false,
        autoBuild: false,
        debounceMs: 1200,
        compileTimeoutMs: 180000,
        customBinDirectory: "C:\\Tools",
      },
      issues: [expect.stringContaining("migrated")],
      source: "file",
    });
  });

  it("recovers invalid settings with bounded defaults", () => {
    expect(
      parseGlobalSettings({
        schemaVersion: 1,
        debounceMs: -1,
        compileTimeoutMs: 0,
      }),
    ).toEqual({
      settings: defaultGlobalSettings(),
      issues: [
        "Global settings were invalid or unsupported and defaults were restored.",
      ],
      source: "default",
    });
  });

  it("uses current defaults for omitted legacy fields", () => {
    expect(parseGlobalSettings({ schemaVersion: 0 })).toMatchObject({
      settings: defaultGlobalSettings(),
      issues: [expect.stringContaining("migrated")],
      source: "file",
    });
  });
});
