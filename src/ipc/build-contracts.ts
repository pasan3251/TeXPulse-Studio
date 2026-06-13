import { z } from "zod";

import { apiErrorSchema } from "./project-contracts.js";

const buildIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u);

export const compileProjectRequestSchema = z
  .object({
    rootFile: z.string().min(1).max(4_096),
  })
  .strict();

export const pdfArtifactSchema = z
  .object({
    buildId: buildIdSchema,
    generation: z.number().int().positive(),
    fileName: z.string().min(1).max(255),
    isCurrent: z.boolean(),
    completedAt: z.iso.datetime(),
  })
  .strict();

export const buildViewSchema = z
  .object({
    buildId: buildIdSchema,
    generation: z.number().int().positive(),
    disposition: z.enum(["current", "stale", "superseded"]),
    status: z.enum([
      "succeeded",
      "failed",
      "cancelled",
      "timed-out",
      "superseded",
    ]),
    durationMs: z.number().nonnegative(),
    failureReason: z.string().nullable(),
    log: z.string(),
    logTruncated: z.boolean(),
    visiblePdf: pdfArtifactSchema.nullable(),
  })
  .strict();

export const compileProjectResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: buildViewSchema }).strict(),
  z.object({ ok: z.literal(false), error: apiErrorSchema }).strict(),
]);

export const pdfArtifactRequestSchema = pdfArtifactSchema.pick({
  buildId: true,
  generation: true,
});

export const loadPdfResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      value: z
        .object({
          artifact: pdfArtifactSchema,
          data: z.instanceof(Uint8Array),
        })
        .strict(),
    })
    .strict(),
  z.object({ ok: z.literal(false), error: apiErrorSchema }).strict(),
]);

export const cancelBuildRequestSchema = z.undefined();
export const cancelBuildResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      value: z.object({ cancelled: z.boolean() }).strict(),
    })
    .strict(),
  z.object({ ok: z.literal(false), error: apiErrorSchema }).strict(),
]);

export const pdfActionResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: z.undefined() }).strict(),
  z.object({ ok: z.literal(false), error: apiErrorSchema }).strict(),
]);

export type CompileProjectRequest = z.infer<typeof compileProjectRequestSchema>;
export type CompileProjectResult = z.infer<typeof compileProjectResultSchema>;
export type BuildView = z.infer<typeof buildViewSchema>;
export type PdfArtifact = z.infer<typeof pdfArtifactSchema>;
export type PdfArtifactRequest = z.infer<typeof pdfArtifactRequestSchema>;
export type LoadPdfResult = z.infer<typeof loadPdfResultSchema>;
export type CancelBuildResult = z.infer<typeof cancelBuildResultSchema>;
export type PdfActionResult = z.infer<typeof pdfActionResultSchema>;
