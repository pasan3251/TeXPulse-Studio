import { z } from "zod";

import { projectSettingsSchema } from "../settings/project-settings.js";

export const createProjectRequestSchema = z.undefined();
export const createProjectEntryRequestSchema = z
  .object({
    path: z.string().min(1).max(4_096),
  })
  .strict();
export const createTextFileRequestSchema = createProjectEntryRequestSchema
  .extend({
    content: z.string().max(10 * 1024 * 1024),
  })
  .strict();
export const deleteProjectEntryRequestSchema = createProjectEntryRequestSchema
  .extend({
    recursive: z.boolean(),
    expectedVersion: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
  })
  .strict();
export const exportProjectRequestSchema = z.undefined();
export const getGitStatusRequestSchema = z.undefined();
export const getRecentProjectsRequestSchema = z.undefined();
export const openProjectRequestSchema = z.undefined();
export const openRecentProjectRequestSchema = z
  .object({
    id: z.string().regex(/^[a-f0-9]{16}$/u),
  })
  .strict();
export const openSampleProjectRequestSchema = z.undefined();
export const renameProjectEntryRequestSchema = z
  .object({
    sourcePath: z.string().min(1).max(4_096),
    destinationPath: z.string().min(1).max(4_096),
    expectedVersion: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
  })
  .strict();

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
      "project-create-failed",
      "project-export-failed",
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

export const projectDescriptionSchema = z
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
  .strict();

export const openProjectResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      value: projectDescriptionSchema,
    })
    .strict(),
  z.object({ ok: z.literal(false), error: apiErrorSchema }).strict(),
]);

export const projectMutationResultSchema = openProjectResultSchema;

const recentProjectSchema = z
  .object({
    id: z.string().regex(/^[a-f0-9]{16}$/u),
    name: z.string().min(1).max(255),
    displayPath: z.string().min(1).max(4_096),
    lastOpenedAt: z.iso.datetime(),
  })
  .strict();

const gitStatusSchema = z
  .object({
    state: z.enum(["not-a-repository", "repository", "unavailable"]),
    branch: z.string().max(1_024).nullable(),
    upstream: z.string().max(1_024).nullable(),
    ahead: z.number().int().nonnegative(),
    behind: z.number().int().nonnegative(),
    stagedCount: z.number().int().nonnegative(),
    modifiedCount: z.number().int().nonnegative(),
    untrackedCount: z.number().int().nonnegative(),
    conflictedCount: z.number().int().nonnegative(),
    hasChanges: z.boolean(),
    message: z.string().max(4_096).nullable(),
  })
  .strict();

export const recentProjectsResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      value: z.array(recentProjectSchema).max(20),
    })
    .strict(),
  z.object({ ok: z.literal(false), error: apiErrorSchema }).strict(),
]);

export const gitStatusResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: gitStatusSchema }).strict(),
  z.object({ ok: z.literal(false), error: apiErrorSchema }).strict(),
]);

export const exportProjectResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      value: z
        .object({
          saved: z.boolean(),
          files: z.number().int().nonnegative(),
          skippedLinks: z.number().int().nonnegative(),
          totalBytes: z.number().int().nonnegative(),
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
export type ProjectMutationResult = z.infer<typeof projectMutationResultSchema>;
export type RecentProjectsResult = z.infer<typeof recentProjectsResultSchema>;
export type GitStatusSummary = z.infer<typeof gitStatusSchema>;
export type GitStatusResult = z.infer<typeof gitStatusResultSchema>;
export type ExportProjectResult = z.infer<typeof exportProjectResultSchema>;
export type ReadTextFileResult = z.infer<typeof readTextFileResultSchema>;
export type WriteTextFileResult = z.infer<typeof writeTextFileResultSchema>;
export type CreateProjectEntryRequest = z.infer<
  typeof createProjectEntryRequestSchema
>;
export type CreateTextFileRequest = z.infer<typeof createTextFileRequestSchema>;
export type DeleteProjectEntryRequest = z.infer<
  typeof deleteProjectEntryRequestSchema
>;
export type OpenRecentProjectRequest = z.infer<
  typeof openRecentProjectRequestSchema
>;
export type ProjectPathRequest = z.infer<typeof projectPathRequestSchema>;
export type RenameProjectEntryRequest = z.infer<
  typeof renameProjectEntryRequestSchema
>;
export type ProjectWriteRequest = z.infer<typeof projectWriteRequestSchema>;
export type ProjectFileChange = z.infer<typeof projectFileChangeSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;

export { PROJECT_CHANNELS } from "./channels.js";
