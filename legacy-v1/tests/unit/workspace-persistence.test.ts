import { describe, expect, it } from "vitest";

import {
  loadWorkspacePreferences,
  saveWorkspacePreferences,
} from "../../src/renderer/workspace-persistence.js";

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("workspace persistence", () => {
  it("returns defaults when no workspace record exists", () => {
    expect(
      loadWorkspacePreferences(new MemoryStorage(), "0".repeat(16)),
    ).toEqual({
      openPaths: [],
      activePath: null,
      bufferViews: {},
      paneRatio: 0.56,
    });
  });

  it("round-trips only open paths, views, and pane geometry", () => {
    const storage = new MemoryStorage();
    const projectId = "a".repeat(16);
    const preferences = {
      openPaths: ["main.tex", "chapters/intro.tex"],
      activePath: "chapters/intro.tex",
      bufferViews: {
        "main.tex": { cursor: 12, scrollTop: 80 },
      },
      paneRatio: 0.62,
    };

    expect(saveWorkspacePreferences(storage, projectId, preferences)).toBe(
      true,
    );
    expect(loadWorkspacePreferences(storage, projectId)).toEqual(preferences);
    expect([...storage.values.values()].join("")).not.toContain(
      "\\documentclass",
    );
  });

  it("migrates version-one workspace state without retaining settings", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      `texpulse.workspace.v1.${"b".repeat(16)}`,
      JSON.stringify({
        schemaVersion: 1,
        openPaths: ["main.tex"],
        activePath: "main.tex",
        bufferViews: {},
        paneRatio: 5,
        settings: {
          autosave: "yes",
          autoBuild: true,
          debounceMs: -1,
        },
      }),
    );

    expect(loadWorkspacePreferences(storage, "b".repeat(16))).toMatchObject({
      openPaths: [],
      activePath: null,
      paneRatio: 0.56,
    });
  });

  it("restores valid version-one workspace geometry and views", () => {
    const storage = new MemoryStorage();
    const projectId = "d".repeat(16);
    storage.setItem(
      `texpulse.workspace.v1.${projectId}`,
      JSON.stringify({
        schemaVersion: 1,
        openPaths: ["main.tex"],
        activePath: "main.tex",
        bufferViews: {
          "main.tex": { cursor: 4, scrollTop: 32 },
        },
        paneRatio: 0.6,
        settings: {
          autosave: false,
          autoBuild: false,
          debounceMs: 1200,
        },
      }),
    );

    expect(loadWorkspacePreferences(storage, projectId)).toEqual({
      openPaths: ["main.tex"],
      activePath: "main.tex",
      bufferViews: {
        "main.tex": { cursor: 4, scrollTop: 32 },
      },
      paneRatio: 0.6,
    });
  });

  it("contains unavailable storage and invalid writes", () => {
    const throwingStorage = {
      getItem(): string | null {
        throw new Error("Storage unavailable");
      },
      setItem(): void {
        throw new Error("Storage unavailable");
      },
    };

    expect(
      loadWorkspacePreferences(throwingStorage, "c".repeat(16)),
    ).toMatchObject({
      openPaths: [],
      paneRatio: 0.56,
    });
    expect(
      saveWorkspacePreferences(throwingStorage, "c".repeat(16), {
        openPaths: [],
        activePath: null,
        bufferViews: {},
        paneRatio: 0.56,
      }),
    ).toBe(false);
    expect(
      saveWorkspacePreferences(new MemoryStorage(), "c".repeat(16), {
        openPaths: [],
        activePath: null,
        bufferViews: {},
        paneRatio: 0.99,
      }),
    ).toBe(false);
  });
});
