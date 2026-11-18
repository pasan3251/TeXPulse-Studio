import { z } from "zod";

export const projectSettingsSchema = z
  .object({
    rootFile: z.string().min(1).max(4_096).nullable(),
    recipe: z.enum(["latexmk-pdf", "latexmk-xelatex", "latexmk-lualatex"]),
    buildDirectory: z.string().min(1).max(4_096),
    autoBuild: z.boolean(),
    allowLatexmkRc: z.boolean(),
  })
  .strict();

export type ProjectSettings = z.infer<typeof projectSettingsSchema>;
