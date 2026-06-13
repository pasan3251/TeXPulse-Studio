import { z } from "zod";

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

export const apiErrorSchema = z
  .object({
    code: z.enum([
      "already-exists",
      "artifact-stale",
      "binary-file",
      "build-failed",
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
          entries: z.array(projectEntrySchema),
          rootCandidates: z.array(rootCandidateSchema),
          rootFile: z.string().nullable(),
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
export type ApiError = z.infer<typeof apiErrorSchema>;

export { PROJECT_CHANNELS } from "./channels.js";
