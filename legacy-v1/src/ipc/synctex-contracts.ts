import { z } from "zod";

import { apiErrorSchema } from "./project-contracts.js";

const buildIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u);
const artifactIdentitySchema = z
  .object({
    buildId: buildIdSchema,
    generation: z.number().int().positive(),
  })
  .strict();

export const forwardSyncRequestSchema = artifactIdentitySchema
  .extend({
    path: z.string().min(1).max(4_096),
    line: z.number().int().positive(),
    column: z.number().int().positive(),
  })
  .strict();

export const forwardSyncTargetSchema = z
  .object({
    page: z.number().int().positive(),
    x: z.number().finite().nonnegative(),
    y: z.number().finite().nonnegative(),
    width: z.number().finite().nonnegative(),
    height: z.number().finite().nonnegative(),
  })
  .strict();

export const inverseSyncRequestSchema = artifactIdentitySchema
  .extend({
    page: z.number().int().positive(),
    x: z.number().finite().nonnegative(),
    y: z.number().finite().nonnegative(),
  })
  .strict();

export const inverseSyncTargetSchema = z
  .object({
    path: z.string().min(1).max(4_096),
    line: z.number().int().positive(),
    column: z.number().int().positive().nullable(),
  })
  .strict();

export const forwardSyncResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: forwardSyncTargetSchema }).strict(),
  z.object({ ok: z.literal(false), error: apiErrorSchema }).strict(),
]);

export const inverseSyncResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: inverseSyncTargetSchema }).strict(),
  z.object({ ok: z.literal(false), error: apiErrorSchema }).strict(),
]);

export type ForwardSyncRequest = z.infer<typeof forwardSyncRequestSchema>;
export type ForwardSyncTarget = z.infer<typeof forwardSyncTargetSchema>;
export type ForwardSyncResult = z.infer<typeof forwardSyncResultSchema>;
export type InverseSyncRequest = z.infer<typeof inverseSyncRequestSchema>;
export type InverseSyncTarget = z.infer<typeof inverseSyncTargetSchema>;
export type InverseSyncResult = z.infer<typeof inverseSyncResultSchema>;
