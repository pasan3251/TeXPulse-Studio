import { z } from "zod";

export const globalSettingsSchema = z
  .object({
    schemaVersion: z.literal(1),
    theme: z.literal("system"),
    autosave: z.boolean(),
    autoBuild: z.boolean(),
    debounceMs: z.number().int().min(200).max(5_000),
    compileTimeoutMs: z.number().int().min(1_000).max(600_000),
    customBinDirectory: z.string().trim().min(1).max(4_096).nullable(),
    editorFontSize: z.number().int().min(10).max(28),
    pdfZoomMode: z.enum(["fit-page", "fit-width"]),
    setupCompleted: z.boolean(),
  })
  .strict();
