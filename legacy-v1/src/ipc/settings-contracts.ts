import { z } from "zod";

import { globalSettingsSchema } from "../settings/settings-schema.js";
import {
  projectSettingsSchema,
  type ProjectSettings,
} from "../settings/project-settings.js";
import { apiErrorSchema } from "./project-contracts.js";

export const getSettingsRequestSchema = z.undefined();
export const getSettingsResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      value: z
        .object({
          settings: globalSettingsSchema,
          issues: z.array(z.string().max(4_096)).max(20),
        })
        .strict(),
    })
    .strict(),
  z.object({ ok: z.literal(false), error: apiErrorSchema }).strict(),
]);

export const saveGlobalSettingsRequestSchema = globalSettingsSchema;
export const saveGlobalSettingsResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: globalSettingsSchema }).strict(),
  z.object({ ok: z.literal(false), error: apiErrorSchema }).strict(),
]);

export const saveProjectSettingsRequestSchema = projectSettingsSchema;
export const saveProjectSettingsResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: projectSettingsSchema }).strict(),
  z.object({ ok: z.literal(false), error: apiErrorSchema }).strict(),
]);

const toolProbeSchema = z
  .object({
    id: z.enum([
      "latexmk",
      "pdflatex",
      "xelatex",
      "lualatex",
      "bibtex",
      "biber",
      "makeindex",
      "synctex",
    ]),
    label: z.string(),
    state: z.enum(["available", "missing", "unusable"]),
    path: z.string().nullable(),
    version: z.string().nullable(),
    exitCode: z.number().int().nullable(),
    detail: z.string().nullable(),
  })
  .strict();

export const toolchainCheckRequestSchema = z
  .object({
    customBinDirectory: z.string().trim().min(1).max(4_096).nullable(),
    skipSelfTest: z.boolean().optional(),
  })
  .strict();

export const toolchainReportSchema = z
  .object({
    ready: z.boolean(),
    tools: z.array(toolProbeSchema),
    issues: z.array(
      z
        .object({
          severity: z.enum(["error", "warning"]),
          tool: toolProbeSchema.shape.id,
          message: z.string(),
        })
        .strict(),
    ),
    selfTest: z
      .object({
        status: z.enum(["passed", "failed", "skipped"]),
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export const toolchainCheckResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: toolchainReportSchema }).strict(),
  z.object({ ok: z.literal(false), error: apiErrorSchema }).strict(),
]);

export type { ProjectSettings };
export type GetSettingsResult = z.infer<typeof getSettingsResultSchema>;
export type SaveGlobalSettingsResult = z.infer<
  typeof saveGlobalSettingsResultSchema
>;
export type SaveProjectSettingsResult = z.infer<
  typeof saveProjectSettingsResultSchema
>;
export type ToolchainCheckRequest = z.infer<typeof toolchainCheckRequestSchema>;
export type ToolchainCheckResult = z.infer<typeof toolchainCheckResultSchema>;
export type ToolchainReport = z.infer<typeof toolchainReportSchema>;
