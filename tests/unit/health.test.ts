import { describe, expect, it } from "vitest";

import { repositoryHealth } from "../../src/health.js";

describe("repository health", () => {
  it("exposes the deterministic Sprint 0 health marker", () => {
    expect(repositoryHealth).toEqual({
      product: "TeXPulse Studio",
      sprint: 0,
      status: "ok",
    });
  });
});
