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
  it("round-trips only open paths, views, pane geometry, and live settings", () => {
    const storage = new MemoryStorage();
    const projectId = "a".repeat(16);
    const preferences = {
      openPaths: ["main.tex", "chapters/intro.tex"],
      activePath: "chapters/intro.tex",
      bufferViews: {
        "main.tex": { cursor: 12, scrollTop: 80 },
      },
      paneRatio: 0.62,
      settings: {
        autosave: true,
        autoBuild: false,
        debounceMs: 1200,
      },
    };

    expect(saveWorkspacePreferences(storage, projectId, preferences)).toBe(
      true,
    );
    expect(loadWorkspacePreferences(storage, projectId)).toEqual(preferences);
    expect([...storage.values.values()].join("")).not.toContain(
      "\\documentclass",
    );
  });

  it("rejects tampered storage and uses the project auto-build default", () => {
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

    expect(
      loadWorkspacePreferences(storage, "b".repeat(16), false),
    ).toMatchObject({
      openPaths: [],
      activePath: null,
      paneRatio: 0.56,
      settings: {
        autosave: true,
        autoBuild: false,
        debounceMs: 800,
      },
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
        settings: { autosave: true, autoBuild: true, debounceMs: 800 },
      }),
    ).toBe(false);
    expect(
      saveWorkspacePreferences(new MemoryStorage(), "c".repeat(16), {
        openPaths: [],
        activePath: null,
        bufferViews: {},
        paneRatio: 0.99,
        settings: { autosave: true, autoBuild: true, debounceMs: 800 },
      }),
    ).toBe(false);
  });
});
