import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rmdir,
  rm,
  stat,
} from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import { atomicWriteFile } from "./atomic-write.js";
import { loadProjectMetadata } from "./project-metadata.js";
import {
  canonicalProjectRoot,
  isMissingPathError,
  normalizeProjectPath,
  resolveProjectPath,
  toPortableProjectPath,
} from "./project-paths.js";
import { rankRootCandidates } from "./root-detection.js";
import {
  ProjectError,
  type ExternalFileState,
  type ProjectEntry,
  type RootCandidate,
  type TextFileSnapshot,
} from "./project-types.js";

const DEFAULT_IGNORED_DIRECTORIES = new Set([
  ".git",
  ".texpulse",
  "coverage",
  "dist",
  "node_modules",
]);
const MAX_TEXT_FILE_BYTES = 10 * 1024 * 1024;

export class ProjectService {
  private constructor(readonly root: string) {}

  static async open(projectDirectory: string): Promise<ProjectService> {
    return new ProjectService(await canonicalProjectRoot(projectDirectory));
  }

  async listEntries(
    additionalIgnoredPaths: readonly string[] = [],
  ): Promise<ProjectEntry[]> {
    let configuredBuildDirectory = ".texpulse/build";
    try {
      const metadata = await loadProjectMetadata(this.root);
      configuredBuildDirectory = metadata.metadata.buildDirectory;
    } catch (error) {
      if (
        !(error instanceof ProjectError && error.code === "link-not-allowed")
      ) {
        throw error;
      }
    }
    const ignoredPaths = new Set([
      ignorePathKey(configuredBuildDirectory),
      ...additionalIgnoredPaths.map((path) =>
        ignorePathKey(normalizeProjectPath(path)),
      ),
    ]);
    const entries: ProjectEntry[] = [];

    const visit = async (directory: string): Promise<void> => {
      const children = await readdir(directory, { withFileTypes: true });
      children.sort((left, right) => left.name.localeCompare(right.name));
      for (const child of children) {
        const absolutePath = resolve(directory, child.name);
        const projectPath = toPortableProjectPath(
          relative(this.root, absolutePath),
        );
        const childStat = await lstat(absolutePath);
        const kind = childStat.isSymbolicLink()
          ? "link"
          : childStat.isDirectory()
            ? "directory"
            : "file";
        entries.push({
          path: projectPath,
          kind,
          size: childStat.size,
          modifiedAt: childStat.mtime.toISOString(),
        });

        const ignoredProjectPath = ignorePathKey(projectPath);
        const ignored =
          DEFAULT_IGNORED_DIRECTORIES.has(child.name.toLowerCase()) ||
          [...ignoredPaths].some(
            (ignoredPath) =>
              ignoredProjectPath === ignoredPath ||
              ignoredProjectPath.startsWith(`${ignoredPath}/`),
          );
        if (kind === "directory" && !ignored) {
          await visit(absolutePath);
        }
      }
    };

    await visit(this.root);
    return entries;
  }

  async readTextFile(projectPath: string): Promise<TextFileSnapshot> {
    const normalized = normalizeProjectPath(projectPath);
    const absolutePath = await resolveProjectPath(this.root, normalized);
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) {
      throw new ProjectError(
        "not-file",
        `Project entry is not a file: ${normalized}`,
        normalized,
      );
    }
    if (fileStat.size > MAX_TEXT_FILE_BYTES) {
      throw new ProjectError(
        "binary-file",
        `Text files cannot exceed ${String(MAX_TEXT_FILE_BYTES)} bytes.`,
        normalized,
      );
    }

    const bytes = await readFile(absolutePath);
    let content: string;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new ProjectError(
        "binary-file",
        `File is not valid UTF-8 text: ${normalized}`,
        normalized,
      );
    }
    if (content.includes("\0")) {
      throw new ProjectError(
        "binary-file",
        `File contains binary data: ${normalized}`,
        normalized,
      );
    }

    return {
      path: normalized,
      content,
      version: versionFor(bytes),
      size: fileStat.size,
      modifiedAt: fileStat.mtime.toISOString(),
    };
  }

  async createDirectory(projectPath: string): Promise<void> {
    const normalized = normalizeProjectPath(projectPath);
    const absolutePath = await resolveProjectPath(this.root, normalized, {
      allowMissing: true,
    });
    try {
      await lstat(absolutePath);
      throw new ProjectError(
        "already-exists",
        `Project entry already exists: ${normalized}`,
        normalized,
      );
    } catch (error) {
      if (!isMissingPathError(error)) {
        throw error;
      }
    }
    await mkdir(absolutePath, { recursive: true });
  }

  async createTextFile(
    projectPath: string,
    content: string,
  ): Promise<TextFileSnapshot> {
    const normalized = normalizeProjectPath(projectPath);
    const absolutePath = await resolveProjectPath(this.root, normalized, {
      allowMissing: true,
    });
    await resolveProjectPath(
      this.root,
      toPortableProjectPath(relative(this.root, dirname(absolutePath))),
      { allowRoot: true },
    );
    try {
      await atomicWriteFile(absolutePath, content, { createOnly: true });
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "EEXIST"
      ) {
        throw new ProjectError(
          "already-exists",
          `Project entry already exists: ${normalized}`,
          normalized,
        );
      }
      throw error;
    }
    return this.readTextFile(normalized);
  }

  async writeTextFile(
    projectPath: string,
    content: string,
    expectedVersion: string,
  ): Promise<TextFileSnapshot> {
    const normalized = normalizeProjectPath(projectPath);
    const absolutePath = await resolveProjectPath(this.root, normalized);
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) {
      throw new ProjectError(
        "not-file",
        `Project entry is not a file: ${normalized}`,
        normalized,
      );
    }
    if ((fileStat.mode & 0o222) === 0) {
      throw new ProjectError(
        "read-only",
        `File is read-only: ${normalized}`,
        normalized,
      );
    }

    const currentBytes = await readFile(absolutePath);
    if (versionFor(currentBytes) !== expectedVersion) {
      throw new ProjectError(
        "conflict",
        `File changed outside TeXPulse Studio: ${normalized}`,
        normalized,
      );
    }

    await atomicWriteFile(absolutePath, content, {
      mode: fileStat.mode,
    });
    return this.readTextFile(normalized);
  }

  async checkTextFile(
    projectPath: string,
    knownVersion: string,
  ): Promise<ExternalFileState> {
    try {
      const current = await this.readTextFile(projectPath);
      return current.version === knownVersion ? "current" : "changed";
    } catch (error) {
      if (error instanceof ProjectError && error.code === "not-found") {
        return "deleted";
      }
      throw error;
    }
  }

  async renameEntry(
    sourcePath: string,
    destinationPath: string,
    expectedVersion?: string,
  ): Promise<void> {
    const source = normalizeProjectPath(sourcePath);
    const destination = normalizeProjectPath(destinationPath);
    const sourceAbsolute = await resolveProjectPath(this.root, source);
    const destinationAbsolute = await resolveProjectPath(
      this.root,
      destination,
      { allowMissing: true },
    );
    await resolveProjectPath(
      this.root,
      toPortableProjectPath(relative(this.root, dirname(destinationAbsolute))),
      { allowRoot: true },
    );

    try {
      await lstat(destinationAbsolute);
      throw new ProjectError(
        "already-exists",
        `Project entry already exists: ${destination}`,
        destination,
      );
    } catch (error) {
      if (!isMissingPathError(error)) {
        throw error;
      }
    }
    if (expectedVersion !== undefined) {
      await this.assertVersion(source, expectedVersion);
    }
    await rename(sourceAbsolute, destinationAbsolute);
  }

  async copyEntry(sourcePath: string, destinationPath: string): Promise<void> {
    const source = normalizeProjectPath(sourcePath);
    const destination = normalizeProjectPath(destinationPath);
    const sourceIdentity = ignorePathKey(source);
    const destinationIdentity = ignorePathKey(destination);
    if (
      destinationIdentity === sourceIdentity ||
      destinationIdentity.startsWith(`${sourceIdentity}/`)
    ) {
      throw new ProjectError(
        "invalid-path",
        "A project entry cannot be copied into itself.",
        destination,
      );
    }

    const sourceAbsolute = await resolveProjectPath(this.root, source);
    const destinationAbsolute = await resolveProjectPath(
      this.root,
      destination,
      { allowMissing: true },
    );
    await resolveProjectPath(
      this.root,
      toPortableProjectPath(relative(this.root, dirname(destinationAbsolute))),
      { allowRoot: true },
    );

    try {
      await lstat(destinationAbsolute);
      throw new ProjectError(
        "already-exists",
        `Project entry already exists: ${destination}`,
        destination,
      );
    } catch (error) {
      if (!isMissingPathError(error)) {
        throw error;
      }
    }

    await this.assertCopyableTree(sourceAbsolute, source);
    let ownsDestination = false;
    try {
      await copyProjectEntry(
        sourceAbsolute,
        destinationAbsolute,
        source,
        () => {
          ownsDestination = true;
        },
      );
    } catch (error) {
      if (ownsDestination || !isAlreadyExistsError(error)) {
        await rm(destinationAbsolute, { recursive: true, force: true }).catch(
          () => undefined,
        );
      }
      if (isAlreadyExistsError(error)) {
        throw new ProjectError(
          "already-exists",
          `Project entry already exists: ${destination}`,
          destination,
        );
      }
      throw error;
    }
  }

  async resolveEntryPath(projectPath: string): Promise<{
    absolutePath: string;
    kind: "directory" | "file";
  }> {
    const normalized = normalizeProjectPath(projectPath);
    const absolutePath = await resolveProjectPath(this.root, normalized);
    const entryStat = await lstat(absolutePath);
    if (entryStat.isSymbolicLink()) {
      throw new ProjectError(
        "link-not-allowed",
        `Project links cannot be opened: ${normalized}`,
        normalized,
      );
    }
    if (!entryStat.isDirectory() && !entryStat.isFile()) {
      throw new ProjectError(
        "not-file",
        `Project entry cannot be opened: ${normalized}`,
        normalized,
      );
    }
    return {
      absolutePath,
      kind: entryStat.isDirectory() ? "directory" : "file",
    };
  }

  async deleteEntry(
    projectPath: string,
    options: { recursive?: boolean; expectedVersion?: string } = {},
  ): Promise<void> {
    const normalized = normalizeProjectPath(projectPath);
    const absolutePath = await resolveProjectPath(this.root, normalized);
    const entryStat = await stat(absolutePath);
    if (entryStat.isDirectory()) {
      if (options.recursive !== true) {
        await rmdir(absolutePath);
        return;
      }
      await rm(absolutePath, {
        recursive: true,
      });
      return;
    }
    if (options.expectedVersion !== undefined) {
      await this.assertVersion(normalized, options.expectedVersion);
    }
    await rm(absolutePath);
  }

  async detectRootFiles(): Promise<RootCandidate[]> {
    const entries = await this.listEntries();
    const files: Array<{ path: string; content: string }> = [];
    for (const entry of entries) {
      if (entry.kind !== "file" || !entry.path.toLowerCase().endsWith(".tex")) {
        continue;
      }
      try {
        const snapshot = await this.readTextFile(entry.path);
        files.push({ path: entry.path, content: snapshot.content });
      } catch (error) {
        if (!(error instanceof ProjectError && error.code === "binary-file")) {
          throw error;
        }
      }
    }
    return rankRootCandidates(files);
  }

  private async assertVersion(
    projectPath: string,
    expectedVersion: string,
  ): Promise<void> {
    const snapshot = await this.readTextFile(projectPath);
    if (snapshot.version !== expectedVersion) {
      throw new ProjectError(
        "conflict",
        `File changed outside TeXPulse Studio: ${projectPath}`,
        projectPath,
      );
    }
  }

  private async assertCopyableTree(
    absolutePath: string,
    projectPath: string,
  ): Promise<void> {
    const entryStat = await lstat(absolutePath);
    if (entryStat.isSymbolicLink()) {
      throw new ProjectError(
        "link-not-allowed",
        `Project links cannot be copied: ${projectPath}`,
        projectPath,
      );
    }
    if (entryStat.isFile()) {
      return;
    }
    if (!entryStat.isDirectory()) {
      throw new ProjectError(
        "not-file",
        `Only regular project files and directories can be copied: ${projectPath}`,
        projectPath,
      );
    }
    const children = await readdir(absolutePath, { withFileTypes: true });
    for (const child of children) {
      await this.assertCopyableTree(
        resolve(absolutePath, child.name),
        `${projectPath}/${child.name}`,
      );
    }
  }
}

async function copyProjectEntry(
  sourceAbsolute: string,
  destinationAbsolute: string,
  sourceProjectPath: string,
  onDestinationCreated?: () => void,
): Promise<void> {
  const sourceStat = await lstat(sourceAbsolute);
  if (sourceStat.isSymbolicLink()) {
    throw new ProjectError(
      "link-not-allowed",
      `Project links cannot be copied: ${sourceProjectPath}`,
      sourceProjectPath,
    );
  }
  if (sourceStat.isDirectory()) {
    await mkdir(destinationAbsolute);
    onDestinationCreated?.();
    const children = await readdir(sourceAbsolute, { withFileTypes: true });
    for (const child of children) {
      await copyProjectEntry(
        resolve(sourceAbsolute, child.name),
        resolve(destinationAbsolute, child.name),
        `${sourceProjectPath}/${child.name}`,
      );
    }
    return;
  }
  if (!sourceStat.isFile()) {
    throw new ProjectError(
      "not-file",
      `Only regular project files and directories can be copied: ${sourceProjectPath}`,
      sourceProjectPath,
    );
  }
  await copyFile(sourceAbsolute, destinationAbsolute, constants.COPYFILE_EXCL);
  onDestinationCreated?.();
}

function versionFor(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function ignorePathKey(projectPath: string): string {
  return process.platform === "win32"
    ? projectPath.toLocaleLowerCase("en-US")
    : projectPath;
}

function isAlreadyExistsError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "EEXIST"
  );
}
