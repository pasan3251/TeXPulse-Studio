import { describe, expect, it } from "vitest";

import { buildProjectTree } from "../../src/renderer/project-tree.js";

describe("buildProjectTree", () => {
  it("converts flat project entries into a deterministic hierarchy", () => {
    expect(
      buildProjectTree([
        {
          path: "main.tex",
          kind: "file",
          size: 10,
          modifiedAt: "2026-06-13T12:00:00.000Z",
        },
        {
          path: "chapters",
          kind: "directory",
          size: 0,
          modifiedAt: "2026-06-13T12:00:00.000Z",
        },
        {
          path: "chapters/intro.tex",
          kind: "file",
          size: 20,
          modifiedAt: "2026-06-13T12:00:00.000Z",
        },
      ]),
    ).toMatchObject([
      {
        name: "chapters",
        path: "chapters",
        kind: "directory",
        children: [
          {
            name: "intro.tex",
            path: "chapters/intro.tex",
            kind: "file",
          },
        ],
      },
      { name: "main.tex", path: "main.tex", kind: "file" },
    ]);
  });
});
