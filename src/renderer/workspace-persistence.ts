import { z } from "zod";

import {
  defaultLiveBuildSettings,
  type LiveBuildSettings,
} from "./live-build-coordinator.js";

const bufferViewSchema = z
  .object({
    cursor: z.number().int().nonnegative(),
    scrollTop: z.number().nonnegative().finite(),
  })
  .strict();

const persistedWorkspaceSchema = z
  .object({
    schemaVersion: z.literal(1),
    openPaths: z.array(z.string().min(1).max(4_096)).max(100),
    activePath: z.string().min(1).max(4_096).nullable(),
    bufferViews: z.record(z.string(), bufferViewSchema),
    paneRatio: z.number().min(0.3).max(0.75),
    settings: z
      .object({
        autosave: z.boolean(),
        autoBuild: z.boolean(),
        debounceMs: z.number().int().min(200).max(5_000),
      })
      .strict(),
  })
  .strict();

export interface PersistedBufferView {
  cursor: number;
  scrollTop: number;
}

export interface WorkspacePreferences {
  openPaths: string[];
  activePath: string | null;
  bufferViews: Record<string, PersistedBufferView>;
  paneRatio: number;
  settings: LiveBuildSettings;
}

export const DEFAULT_PANE_RATIO = 0.56;

export function defaultWorkspacePreferences(
  autoBuild = true,
): WorkspacePreferences {
  return {
    openPaths: [],
    activePath: null,
    bufferViews: {},
    paneRatio: DEFAULT_PANE_RATIO,
    settings: defaultLiveBuildSettings(autoBuild),
  };
}

export function loadWorkspacePreferences(
  storage: Pick<Storage, "getItem">,
  projectId: string,
  autoBuildDefault = true,
): WorkspacePreferences {
  const fallback = defaultWorkspacePreferences(autoBuildDefault);
  try {
    const raw = storage.getItem(storageKey(projectId));
    if (raw === null) {
      return fallback;
    }
    const parsed = persistedWorkspaceSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return fallback;
    }
    return {
      openPaths: parsed.data.openPaths,
      activePath: parsed.data.activePath,
      bufferViews: parsed.data.bufferViews,
      paneRatio: parsed.data.paneRatio,
      settings: parsed.data.settings,
    };
  } catch {
    return fallback;
  }
}

export function saveWorkspacePreferences(
  storage: Pick<Storage, "setItem">,
  projectId: string,
  preferences: WorkspacePreferences,
): boolean {
  const parsed = persistedWorkspaceSchema.safeParse({
    schemaVersion: 1,
    ...preferences,
  });
  if (!parsed.success) {
    return false;
  }
  try {
    storage.setItem(storageKey(projectId), JSON.stringify(parsed.data));
    return true;
  } catch {
    return false;
  }
}

function storageKey(projectId: string): string {
  return `texpulse.workspace.v1.${projectId}`;
}
