import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  parseForwardSyncOutput,
  parseInverseSyncOutput,
} from "../../src/synctex/synctex-parser.js";

const fixtureRoot = resolve("fixtures", "synctex-multifile");

describe("SyncTeX output parser", () => {
  it("parses a bounded forward-search target", async () => {
    const output = await readFile(
      resolve(fixtureRoot, "forward-output.txt"),
      "utf8",
    );

    expect(parseForwardSyncOutput(output)).toEqual({
      page: 1,
      x: 155.907562,
      y: 134.764618,
      width: 343.71106,
      height: 8.855677,
    });
  });

  it("maps mixed Windows path separators to a known included file", async () => {
    const output = await readFile(
      resolve(fixtureRoot, "inverse-output.txt"),
      "utf8",
    );

    expect(
      parseInverseSyncOutput(output, ["main.tex", "chapters/intro.tex"]),
    ).toEqual({
      path: "chapters/intro.tex",
      line: 2,
      column: null,
    });
  });

  it("rejects malformed, external, and oversized results", () => {
    expect(parseForwardSyncOutput("not a result")).toBeNull();
    expect(
      parseForwardSyncOutput(
        "SyncTeX result begin\nPage:0\nx:nope\ny:4\nSyncTeX result end",
      ),
    ).toBeNull();
    expect(
      parseInverseSyncOutput(
        "SyncTeX result begin\nInput:C:/outside/secret.tex\nLine:1\nSyncTeX result end",
        ["main.tex"],
      ),
    ).toBeNull();
    expect(parseForwardSyncOutput("x".repeat(512 * 1024 + 1))).toBeNull();
  });

  it("defaults missing forward dimensions to a point target", () => {
    expect(
      parseForwardSyncOutput(
        "SyncTeX result begin\nPage:2\nx:10\ny:20\nSyncTeX result end",
      ),
    ).toEqual({
      page: 2,
      x: 10,
      y: 20,
      width: 0,
      height: 0,
    });
  });
});
