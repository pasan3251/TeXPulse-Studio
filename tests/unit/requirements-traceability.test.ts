import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "..", "..");

describe("requirements traceability", () => {
  it("mentions every SRS requirement and acceptance scenario", async () => {
    const [srs, traceability] = await Promise.all([
      readFile(resolve(repositoryRoot, "docs", "SRS.md"), "utf8"),
      readFile(
        resolve(repositoryRoot, "docs", "REQUIREMENTS_TRACEABILITY.md"),
        "utf8",
      ),
    ]);
    const requirementIds = [
      ...new Set(srs.match(/\b(?:FR|NFR|AS)-[A-Z]+-\d{3}\b/gu) ?? []),
    ].sort();
    const missing = requirementIds.filter(
      (requirementId) => !traceability.includes(`\`${requirementId}\``),
    );

    expect(requirementIds.length).toBeGreaterThan(100);
    expect(missing).toEqual([]);
  });
});
