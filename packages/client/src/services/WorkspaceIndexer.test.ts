import { describe, expect, it } from "vitest";
import { DEFAULT_PROJECT_FILES } from "../data/defaultProject.js";
import { buildProjectSymbolIndex } from "./WorkspaceIndexer.js";

describe("WorkspaceIndexer", () => {
  it("indexes \\label{} keys across multiple .tex files and @entries from .bib files", () => {
    const index = buildProjectSymbolIndex(DEFAULT_PROJECT_FILES);

    expect(index.labels.map((label) => label.key)).toEqual([
      "sec:intro",
      "subsec:formulation",
      "eq:lindblad",
      "sec:hamiltonian",
      "eq:fidelity",
      "subsec:scaling",
      "sec:zne",
      "eq:richardson",
    ]);

    expect(index.citations.map((entry) => entry.key)).toEqual([
      "knuth1984texbook",
      "preskill2018nisq",
      "temme2017error",
      "li2017efficient",
      "kandala2019error",
      "vaswani2017attention",
    ]);
  });
});
