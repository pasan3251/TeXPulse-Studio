import { describe, expect, it } from "vitest";

import {
  defaultProjectMetadata,
  parseProjectMetadata,
} from "../../src/project/project-metadata.js";

describe("project metadata", () => {
  it("accepts the version-two schema", () => {
    const metadata = {
      schemaVersion: 2 as const,
      rootFile: "main.tex",
      recipe: "latexmk-xelatex" as const,
      buildDirectory: "build",
      autoBuild: false,
      allowLatexmkRc: true,
    };
    expect(parseProjectMetadata(metadata)).toEqual({
      metadata,
      issues: [],
      source: "file",
    });
  });

  it("falls back safely for malformed values", () => {
    const result = parseProjectMetadata({
      schemaVersion: 1,
      rootFile: "../outside.tex",
      recipe: "shell",
      buildDirectory: "C:\\outside",
      autoBuild: "yes",
      allowLatexmkRc: "yes",
    });
    expect(result.metadata).toEqual(defaultProjectMetadata());
    expect(result.issues).toHaveLength(5);
  });

  it("migrates version one with latexmkrc disabled", () => {
    expect(
      parseProjectMetadata({
        schemaVersion: 1,
        rootFile: "main.tex",
        recipe: "latexmk-xelatex",
        buildDirectory: "build",
        autoBuild: false,
      }),
    ).toMatchObject({
      metadata: {
        schemaVersion: 2,
        rootFile: "main.tex",
        recipe: "latexmk-xelatex",
        buildDirectory: "build",
        autoBuild: false,
        allowLatexmkRc: false,
      },
      issues: [expect.stringContaining("migrated")],
      source: "file",
    });
  });

  it("does not partially trust an unsupported schema version", () => {
    expect(parseProjectMetadata({ schemaVersion: 99 })).toEqual({
      metadata: defaultProjectMetadata(),
      issues: ["Unsupported or missing project metadata schemaVersion."],
      source: "default",
    });
  });
});
