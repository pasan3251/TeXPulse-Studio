import { isAbsolute, relative, resolve } from "node:path";

import { watch, type FSWatcher } from "chokidar";

import type { ProjectFileChange } from "../ipc/project-contracts.js";
import {
  isPathInside,
  normalizeProjectPath,
  toPortableProjectPath,
} from "./project-paths.js";

const DEFAULT_IGNORED_DIRECTORIES = new Set([
  ".git",
  ".texpulse",
  "coverage",
  "dist",
  "node_modules",
]);

type ProjectFileChangeKind = ProjectFileChange["kind"];
export type ProjectWatchChange = Pick<ProjectFileChange, "kind" | "path">;

export class ProjectChangeFilter {
  private readonly internalVersions = new Map<string, string>();

  recordInternalWrite(path: string, version: string): void {
    this.internalVersions.set(pathKey(normalizeProjectPath(path)), version);
  }

  async shouldEmit(
    change: ProjectWatchChange,
    readVersion: (path: string) => Promise<string>,
  ): Promise<boolean> {
    const key = pathKey(change.path);
    const internalVersion = this.internalVersions.get(key);
    if (internalVersion === undefined) {
      return true;
    }
    if (change.kind === "deleted") {
      this.internalVersions.delete(key);
      return true;
    }

    try {
      const changed = (await readVersion(change.path)) !== internalVersion;
      if (changed) {
        this.internalVersions.delete(key);
      }
      return changed;
    } catch {
      this.internalVersions.delete(key);
      return true;
    }
  }
}

export interface ProjectWatcherOptions {
  root: string;
  buildDirectory: string;
  onChange: (change: ProjectWatchChange) => void;
  onError?: (error: Error) => void;
  onReady?: () => void;
  readVersion: (path: string) => Promise<string>;
}

export class ProjectWatcher {
  private readonly filter = new ProjectChangeFilter();
  private readonly watcher: FSWatcher;
  private eventQueue = Promise.resolve();

  constructor(private readonly options: ProjectWatcherOptions) {
    this.watcher = watch(".", {
      atomic: 200,
      awaitWriteFinish: {
        pollInterval: 25,
        stabilityThreshold: 150,
      },
      cwd: options.root,
      followSymlinks: false,
      ignoreInitial: true,
      persistent: false,
      ignored: (path) =>
        shouldIgnoreProjectWatchPath(
          options.root,
          path,
          options.buildDirectory,
        ),
    });
    this.watcher.on("add", (path) => {
      this.enqueue("added", path);
    });
    this.watcher.on("change", (path) => {
      this.enqueue("changed", path);
    });
    this.watcher.on("unlink", (path) => {
      this.enqueue("deleted", path);
    });
    this.watcher.on("error", (error) => {
      this.options.onError?.(
        error instanceof Error ? error : new Error(String(error)),
      );
    });
    this.watcher.on("ready", () => {
      this.options.onReady?.();
    });
  }

  recordInternalWrite(path: string, version: string): void {
    this.filter.recordInternalWrite(path, version);
  }

  async close(): Promise<void> {
    await this.watcher.close();
    await this.eventQueue;
  }

  private enqueue(kind: ProjectFileChangeKind, watchedPath: string): void {
    this.eventQueue = this.eventQueue
      .then(async () => {
        const path = projectPathFromWatcher(this.options.root, watchedPath);
        if (
          path === null ||
          shouldIgnoreNormalizedProjectPath(path, this.options.buildDirectory)
        ) {
          return;
        }
        const change = { kind, path };
        if (await this.filter.shouldEmit(change, this.options.readVersion)) {
          this.options.onChange(change);
        }
      })
      .catch((error: unknown) => {
        this.options.onError?.(
          error instanceof Error ? error : new Error(String(error)),
        );
      });
  }
}

export function shouldIgnoreProjectWatchPath(
  root: string,
  watchedPath: string,
  buildDirectory: string,
): boolean {
  const projectPath = projectPathFromWatcher(root, watchedPath);
  return (
    projectPath !== null &&
    shouldIgnoreNormalizedProjectPath(projectPath, buildDirectory)
  );
}

function shouldIgnoreNormalizedProjectPath(
  projectPath: string,
  buildDirectory: string,
): boolean {
  const key = pathKey(projectPath);
  const buildKey = pathKey(normalizeProjectPath(buildDirectory));
  const firstComponent = projectPath.split("/")[0]?.toLowerCase();
  return (
    (firstComponent !== undefined &&
      DEFAULT_IGNORED_DIRECTORIES.has(firstComponent)) ||
    key === buildKey ||
    key.startsWith(`${buildKey}/`)
  );
}

function projectPathFromWatcher(
  root: string,
  watchedPath: string,
): string | null {
  const absolutePath = isAbsolute(watchedPath)
    ? resolve(watchedPath)
    : resolve(root, watchedPath);
  if (!isPathInside(root, absolutePath)) {
    return null;
  }
  const portable = toPortableProjectPath(relative(root, absolutePath));
  if (portable === "") {
    return null;
  }
  try {
    return normalizeProjectPath(portable);
  } catch {
    return null;
  }
}

function pathKey(path: string): string {
  return process.platform === "win32" ? path.toLocaleLowerCase("en-US") : path;
}
