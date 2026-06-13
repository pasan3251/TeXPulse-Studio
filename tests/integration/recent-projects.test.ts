import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { RecentProjectsStore } from "../../src/project/recent-projects.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "texpulse-recents-"));
  temporaryDirectories.push(path);
  return path;
}

describe("RecentProjectsStore", () => {
  it("deduplicates, orders, limits, removes, and clears projects", async () => {
    const storage = await temporaryDirectory();
    const first = await temporaryDirectory();
    const second = await temporaryDirectory();
    let tick = 0;
    const store = new RecentProjectsStore(
      join(storage, "recent-projects.json"),
      2,
      () => new Date(Date.UTC(2026, 5, 13, 12, 0, tick++)),
    );

    await store.add(first);
    await store.add(second);
    const projects = await store.add(first);
    expect(projects.map((project) => project.path)).toEqual([first, second]);
    expect(projects[0]?.lastOpenedAt).toBe("2026-06-13T12:00:02.000Z");

    await expect(store.remove(first)).resolves.toMatchObject([
      { path: second },
    ]);
    await store.clear();
    await expect(store.load()).resolves.toEqual({ projects: [], issues: [] });
  });

  it("falls back safely when persisted JSON is invalid", async () => {
    const storage = await temporaryDirectory();
    const storagePath = join(storage, "recent-projects.json");
    await writeFile(storagePath, "{not json");
    const store = new RecentProjectsStore(storagePath);

    await expect(store.load()).resolves.toEqual({
      projects: [],
      issues: ["Recent-project data is not valid JSON."],
    });
  });
});
