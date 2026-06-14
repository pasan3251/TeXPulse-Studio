import { z } from "zod";

import { apiErrorSchema } from "./project-contracts.js";

export const MAX_RECOVERY_BUFFERS = 20;
export const MAX_RECOVERY_BUFFER_BYTES = 2 * 1024 * 1024;
export const MAX_RECOVERY_TOTAL_BYTES = 10 * 1024 * 1024;

const recoveryBufferSchema = z
  .object({
    path: z.string().min(1).max(4_096),
    content: z.string().max(MAX_RECOVERY_BUFFER_BYTES),
    version: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();

export const recoverySnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    projectId: z.string().regex(/^[a-f0-9]{16}$/u),
    savedAt: z.iso.datetime(),
    buffers: z.array(recoveryBufferSchema).min(1).max(MAX_RECOVERY_BUFFERS),
  })
  .strict();

export const saveRecoveryRequestSchema = recoverySnapshotSchema
  .pick({ projectId: true, buffers: true })
  .strict();
export const getRecoveryRequestSchema = z.undefined();
export const clearRecoveryRequestSchema = z.undefined();
export const exportSupportLogRequestSchema = z.undefined();
export const clearLocalDataRequestSchema = z.undefined();

const failureSchema = z
  .object({ ok: z.literal(false), error: apiErrorSchema })
  .strict();

export const saveRecoveryResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      value: z.object({ savedAt: z.iso.datetime() }).strict(),
    })
    .strict(),
  failureSchema,
]);

export const getRecoveryResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      value: recoverySnapshotSchema.nullable(),
    })
    .strict(),
  failureSchema,
]);

export const clearRecoveryResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      value: z.object({ cleared: z.boolean() }).strict(),
    })
    .strict(),
  failureSchema,
]);

export const exportSupportLogResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      value: z.object({ saved: z.boolean() }).strict(),
    })
    .strict(),
  failureSchema,
]);

export const clearLocalDataResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      value: z
        .object({ recoverySnapshots: z.number().int().nonnegative() })
        .strict(),
    })
    .strict(),
  failureSchema,
]);

export type RecoverySnapshot = z.infer<typeof recoverySnapshotSchema>;
export type SaveRecoveryRequest = z.infer<typeof saveRecoveryRequestSchema>;
export type SaveRecoveryResult = z.infer<typeof saveRecoveryResultSchema>;
export type GetRecoveryResult = z.infer<typeof getRecoveryResultSchema>;
export type ClearRecoveryResult = z.infer<typeof clearRecoveryResultSchema>;
export type ExportSupportLogResult = z.infer<
  typeof exportSupportLogResultSchema
>;
export type ClearLocalDataResult = z.infer<typeof clearLocalDataResultSchema>;
