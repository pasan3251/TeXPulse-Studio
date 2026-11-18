import { describe, expect, it } from "vitest";

import { rankRootCandidates } from "../../src/project/root-detection.js";

describe("root detection", () => {
  it("ranks document roots above included fragments", () => {
    expect(
      rankRootCandidates([
        { path: "chapters/intro.tex", content: "\\section{Introduction}" },
        {
          path: "paper.tex",
          content:
            "\\documentclass{article}\n\\begin{document}\nHello\\end{document}",
        },
        {
          path: "main.tex",
          content: "\\documentclass{book}\n\\input{chapters/intro}",
        },
      ]),
    ).toEqual([
      {
        path: "paper.tex",
        score: 140,
        reasons: ["contains documentclass", "contains document environment"],
      },
      {
        path: "main.tex",
        score: 120,
        reasons: [
          "contains documentclass",
          "uses a conventional root filename",
        ],
      },
    ]);
  });

  it("uses deterministic path ordering for tied candidates", () => {
    const content = "\\documentclass{article}";
    expect(
      rankRootCandidates([
        { path: "z.tex", content },
        { path: "a.tex", content },
      ]).map((candidate) => candidate.path),
    ).toEqual(["a.tex", "z.tex"]);
  });
});
