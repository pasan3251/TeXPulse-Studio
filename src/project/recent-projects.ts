import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

import { atomicWriteFile } from "./atomic-write.js";
import { canonicalProjectRoot } from "./project-paths.js";
import type {
  RecentProject,
  RecentProjectsLoadResult,
} from "./project-types.js";

interface RecentProjectsFile {
  schemaVersion: 1;
  projects: RecentProject[];
}

export class RecentProjectsStore {
  constructor(
    private readonly storagePath: string,
    private readonly maximumProjects = 20,
    private readonly now: () => Date = () => new Date(),
  ) {
    if (!Number.isInteger(maximumProjects) || maximumProjects <= 0) {
      throw new Error("maximumProjects must be a positive integer.");
    }
  }

  async load(): Promise<RecentProjectsLoadResult> {
    let raw: string;
    try {
      raw = await readFile(this.storagePath, "utf8");
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        return { projects: [], issues: [] };
      }
      throw error;
    }

    try {
      const value = JSON.parse(raw) as unknown;
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return {
          projects: [],
          issues: ["Recent-project data must be an object."],
        };
      }
      const record = value as Record<string, unknown>;
      if (record.schemaVersion !== 1 || !Array.isArray(record.projects)) {
        return {
          projects: [],
          issues: ["Recent-project data uses an unsupported schema."],
        };
      }

      const projects: RecentProject[] = [];
      for (const candidate of record.projects) {
        if (
          typeof candidate === "object" &&
          candidate !== null &&
          !Array.isArray(candidate)
        ) {
          const project = candidate as Record<string, unknown>;
          if (
            typeof project.path === "string" &&
            typeof project.lastOpenedAt === "string" &&
            !Number.isNaN(Date.parse(project.lastOpenedAt))
          ) {
            projects.push({
              path: project.path,
              lastOpenedAt: project.lastOpenedAt,
            });
          }
        }
      }
      return { projects, issues: [] };
    } catch {
      return {
        projects: [],
        issues: ["Recent-project data is not valid JSON."],
      };
    }
  }

  async add(projectDirectory: string): Promise<RecentProject[]> {
    const canonical = await canonicalProjectRoot(projectDirectory);
    const current = await this.load();
    const key = pathKey(canonical);
    const projects = [
      { path: canonical, lastOpenedAt: this.now().toISOString() },
      ...current.projects.filter((project) => pathKey(project.path) !== key),
    ].slice(0, this.maximumProjects);
    await this.save(projects);
    return projects;
  }

  async remove(projectDirectory: string): Promise<RecentProject[]> {
    const key = pathKey(projectDirectory);
    const current = await this.load();
    const projects = current.projects.filter(
      (project) => pathKey(project.path) !== key,
    );
    await this.save(projects);
    return projects;
  }

  async clear(): Promise<void> {
    await this.save([]);
  }

  private async save(projects: RecentProject[]): Promise<void> {
    const value: RecentProjectsFile = { schemaVersion: 1, projects };
    await mkdir(dirname(this.storagePath), { recursive: true });
    await atomicWriteFile(
      this.storagePath,
      `${JSON.stringify(value, null, 2)}\n`,
    );
  }
}

function pathKey(projectPath: string): string {
  return process.platform === "win32"
    ? projectPath.toLocaleLowerCase("en-US")
    : projectPath;
}
