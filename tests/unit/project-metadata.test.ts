import { describe, expect, it } from "vitest";

import {
  defaultProjectMetadata,
  parseProjectMetadata,
} from "../../src/project/project-metadata.js";

describe("project metadata", () => {
  it("accepts the version-one schema", () => {
    const metadata = {
      schemaVersion: 1 as const,
      rootFile: "main.tex",
      recipe: "latexmk-xelatex" as const,
      buildDirectory: "build",
      autoBuild: false,
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
    });
    expect(result.metadata).toEqual(defaultProjectMetadata());
    expect(result.issues).toHaveLength(4);
  });

  it("does not partially trust an unsupported schema version", () => {
    expect(
      parseProjectMetadata({
        schemaVersion: 2,
        rootFile: "future.tex",
        recipe: "latexmk-xelatex",
        buildDirectory: "future-build",
        autoBuild: false,
      }),
    ).toEqual({
      metadata: defaultProjectMetadata(),
      issues: ["Unsupported or missing project metadata schemaVersion."],
      source: "default",
    });
  });
});
