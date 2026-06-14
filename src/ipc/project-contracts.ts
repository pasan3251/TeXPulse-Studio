import { z } from "zod";

import { projectSettingsSchema } from "../settings/project-settings.js";

export const openProjectRequestSchema = z.undefined();

export const projectPathRequestSchema = z
  .object({
    path: z.string().min(1).max(4_096),
  })
  .strict();

export const projectWriteRequestSchema = z
  .object({
    path: z.string().min(1).max(4_096),
    content: z.string().max(10 * 1024 * 1024),
    expectedVersion: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();

const projectEntrySchema = z
  .object({
    path: z.string(),
    kind: z.enum(["directory", "file", "link"]),
    size: z.number().nonnegative(),
    modifiedAt: z.iso.datetime(),
  })
  .strict();

const rootCandidateSchema = z
  .object({
    path: z.string(),
    score: z.number().int().nonnegative(),
    reasons: z.array(z.string()),
  })
  .strict();

const textFileSnapshotSchema = z
  .object({
    path: z.string(),
    content: z.string(),
    version: z.string().regex(/^[a-f0-9]{64}$/u),
    size: z.number().nonnegative(),
    modifiedAt: z.iso.datetime(),
  })
  .strict();

export const projectFileChangeSchema = z
  .object({
    projectId: z.string().regex(/^[a-f0-9]{16}$/u),
    path: z.string().min(1).max(4_096),
    kind: z.enum(["added", "changed", "deleted"]),
  })
  .strict();

export const apiErrorSchema = z
  .object({
    code: z.enum([
      "already-exists",
      "artifact-stale",
      "binary-file",
      "build-failed",
      "cleanup-busy",
      "cancelled",
      "conflict",
      "external-open-failed",
      "internal",
      "invalid-metadata",
      "invalid-path",
      "invalid-request",
      "link-not-allowed",
      "no-pdf",
      "no-project",
      "no-root",
      "not-directory",
      "not-file",
      "not-found",
      "path-escape",
      "pdf-too-large",
      "read-only",
      "recovery-invalid",
      "recovery-too-large",
      "support-export-failed",
      "synctex-failed",
      "synctex-stale",
      "synctex-unavailable",
      "unauthorized",
    ]),
    message: z.string(),
    projectPath: z.string().nullable(),
  })
  .strict();

export const openProjectResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      value: z
        .object({
          name: z.string().min(1),
          projectId: z.string().regex(/^[a-f0-9]{16}$/u),
          entries: z.array(projectEntrySchema),
          rootCandidates: z.array(rootCandidateSchema),
          rootFile: z.string().nullable(),
          autoBuild: z.boolean(),
          settings: projectSettingsSchema,
          settingsIssues: z.array(z.string().max(4_096)).max(20),
        })
        .strict(),
    })
    .strict(),
  z.object({ ok: z.literal(false), error: apiErrorSchema }).strict(),
]);

export const readTextFileResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: textFileSnapshotSchema }).strict(),
  z.object({ ok: z.literal(false), error: apiErrorSchema }).strict(),
]);

export const writeTextFileResultSchema = readTextFileResultSchema;

export type OpenProjectResult = z.infer<typeof openProjectResultSchema>;
export type ReadTextFileResult = z.infer<typeof readTextFileResultSchema>;
export type WriteTextFileResult = z.infer<typeof writeTextFileResultSchema>;
export type ProjectPathRequest = z.infer<typeof projectPathRequestSchema>;
export type ProjectWriteRequest = z.infer<typeof projectWriteRequestSchema>;
export type ProjectFileChange = z.infer<typeof projectFileChangeSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;

export { PROJECT_CHANNELS } from "./channels.js";
