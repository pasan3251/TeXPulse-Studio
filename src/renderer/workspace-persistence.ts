import { z } from "zod";

const bufferViewSchema = z
  .object({
    cursor: z.number().int().nonnegative(),
    scrollTop: z.number().nonnegative().finite(),
  })
  .strict();

const persistedWorkspaceSchemaV2 = z
  .object({
    schemaVersion: z.literal(2),
    openPaths: z.array(z.string().min(1).max(4_096)).max(100),
    activePath: z.string().min(1).max(4_096).nullable(),
    bufferViews: z.record(z.string(), bufferViewSchema),
    paneRatio: z.number().min(0.3).max(0.75),
  })
  .strict();

const persistedWorkspaceSchemaV1 = z
  .object({
    schemaVersion: z.literal(1),
    openPaths: z.array(z.string().min(1).max(4_096)).max(100),
    activePath: z.string().min(1).max(4_096).nullable(),
    bufferViews: z.record(z.string(), bufferViewSchema),
    paneRatio: z.number().min(0.3).max(0.75),
    settings: z.unknown(),
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
}

export const DEFAULT_PANE_RATIO = 0.56;

export function defaultWorkspacePreferences(): WorkspacePreferences {
  return {
    openPaths: [],
    activePath: null,
    bufferViews: {},
    paneRatio: DEFAULT_PANE_RATIO,
  };
}

export function loadWorkspacePreferences(
  storage: Pick<Storage, "getItem">,
  projectId: string,
): WorkspacePreferences {
  const fallback = defaultWorkspacePreferences();
  try {
    const raw =
      storage.getItem(storageKey(projectId)) ??
      storage.getItem(legacyStorageKey(projectId));
    if (raw === null) {
      return fallback;
    }
    const value: unknown = JSON.parse(raw);
    const current = persistedWorkspaceSchemaV2.safeParse(value);
    const legacy = persistedWorkspaceSchemaV1.safeParse(value);
    const parsed = current.success
      ? current.data
      : legacy.success
        ? legacy.data
        : null;
    if (parsed === null) {
      return fallback;
    }
    return {
      openPaths: parsed.openPaths,
      activePath: parsed.activePath,
      bufferViews: parsed.bufferViews,
      paneRatio: parsed.paneRatio,
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
  const parsed = persistedWorkspaceSchemaV2.safeParse({
    schemaVersion: 2,
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
  return `texpulse.workspace.v2.${projectId}`;
}

function legacyStorageKey(projectId: string): string {
  return `texpulse.workspace.v1.${projectId}`;
}
