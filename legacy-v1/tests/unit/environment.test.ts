import { delimiter, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { environmentWithPrependedPath } from "../../src/process/environment.js";

describe("environmentWithPrependedPath", () => {
  it("prepends a custom executable directory without discarding the PATH", () => {
    const result = environmentWithPrependedPath("custom tools", {
      PATH: "existing-path",
      KEEP_ME: "yes",
    });

    expect(result).toEqual({
      PATH: `${resolve("custom tools")}${delimiter}existing-path`,
      KEEP_ME: "yes",
    });
  });

  it("returns undefined when no custom directory is configured", () => {
    expect(environmentWithPrependedPath(undefined)).toBeUndefined();
  });

  it("sets the PATH when the existing environment has no PATH", () => {
    expect(environmentWithPrependedPath("custom tools", {})).toEqual({
      PATH: resolve("custom tools"),
    });
  });

  it("reuses a case-insensitive Windows Path key", () => {
    expect(
      environmentWithPrependedPath("custom tools", {
        Path: "existing-path",
      }),
    ).toEqual({
      Path: `${resolve("custom tools")}${delimiter}existing-path`,
    });
  });
});
