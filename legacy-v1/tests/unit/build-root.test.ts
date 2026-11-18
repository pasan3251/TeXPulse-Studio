import { describe, expect, it } from "vitest";

import { selectBuildRoot } from "../../src/renderer/build-root.js";

describe("selectBuildRoot", () => {
  it("prefers the active TeX file", () => {
    expect(
      selectBuildRoot("chapters/intro.tex", "main.tex", [
        "main.tex",
        "chapters/intro.tex",
      ]),
    ).toBe("chapters/intro.tex");
    expect(
      selectBuildRoot("CHAPTERS/INTRO.TEX", "main.tex", ["CHAPTERS/INTRO.TEX"]),
    ).toBe("CHAPTERS/INTRO.TEX");
  });

  it("falls back to the configured root for non-roots and non-TeX files", () => {
    expect(
      selectBuildRoot("chapters/intro.tex", "main.tex", ["main.tex"]),
    ).toBe("main.tex");
    expect(selectBuildRoot("references.bib", "main.tex")).toBe("main.tex");
    expect(selectBuildRoot(null, "main.tex")).toBe("main.tex");
  });

  it("reports no build root when neither choice is available", () => {
    expect(selectBuildRoot("notes.md", null)).toBeNull();
    expect(selectBuildRoot(null, undefined)).toBeNull();
  });
});
