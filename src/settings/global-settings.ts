import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { z } from "zod";

import { atomicWriteFile } from "../project/atomic-write.js";
import type {
  GlobalSettings,
  GlobalSettingsLoadResult,
} from "./settings-types.js";
import { defaultGlobalSettings } from "./settings-types.js";
import { globalSettingsSchema } from "./settings-schema.js";

const legacySettingsSchema = z
  .object({
    schemaVersion: z.literal(0),
    autosave: z.boolean().optional(),
    autoBuild: z.boolean().optional(),
    debounceMs: z.number().optional(),
    compileTimeoutMs: z.number().optional(),
    toolchain: z
      .object({
        customBinDirectory: z.string().nullable(),
      })
      .strict()
      .optional(),
  })
  .strict();

export function parseGlobalSettings(value: unknown): GlobalSettingsLoadResult {
  const current = globalSettingsSchema.safeParse(value);
  if (current.success) {
    return { settings: current.data, issues: [], source: "file" };
  }

  const legacy = legacySettingsSchema.safeParse(value);
  if (legacy.success) {
    const fallback = defaultGlobalSettings();
    const migrated = globalSettingsSchema.parse({
      ...fallback,
      autosave: legacy.data.autosave ?? fallback.autosave,
      autoBuild: legacy.data.autoBuild ?? fallback.autoBuild,
      debounceMs: legacy.data.debounceMs ?? fallback.debounceMs,
      compileTimeoutMs:
        legacy.data.compileTimeoutMs ?? fallback.compileTimeoutMs,
      customBinDirectory:
        legacy.data.toolchain?.customBinDirectory ??
        fallback.customBinDirectory,
    });
    return {
      settings: migrated,
      issues: ["Global settings were migrated from schema version 0."],
      source: "file",
    };
  }

  return {
    settings: defaultGlobalSettings(),
    issues: [
      "Global settings were invalid or unsupported and defaults were restored.",
    ],
    source: "default",
  };
}

export class GlobalSettingsStore {
  private readonly settingsPath: string;

  constructor(userDataDirectory: string) {
    this.settingsPath = join(userDataDirectory, "settings.json");
  }

  async load(): Promise<GlobalSettingsLoadResult> {
    let raw: string;
    try {
      raw = await readFile(this.settingsPath, "utf8");
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        return {
          settings: defaultGlobalSettings(),
          issues: [],
          source: "default",
        };
      }
      throw error;
    }

    try {
      return parseGlobalSettings(JSON.parse(raw));
    } catch {
      return {
        settings: defaultGlobalSettings(),
        issues: [
          "Global settings were not valid JSON and defaults were restored.",
        ],
        source: "default",
      };
    }
  }

  async save(settings: GlobalSettings): Promise<GlobalSettings> {
    const parsed = globalSettingsSchema.parse(settings);
    await mkdir(dirname(this.settingsPath), { recursive: true });
    await atomicWriteFile(
      this.settingsPath,
      `${JSON.stringify(parsed, null, 2)}\n`,
    );
    return parsed;
  }
}
