import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  lstat,
  open,
  readdir,
  rename,
  rm,
  stat,
  type FileHandle,
} from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";

import { loadProjectMetadata } from "./project-metadata.js";
import {
  canonicalProjectRoot,
  toPortableProjectPath,
} from "./project-paths.js";

const MAX_ZIP_ENTRIES = 65_535;
const MAX_ZIP_VALUE = 0xffff_ffff;
const IGNORED_TOP_LEVEL_DIRECTORIES = new Set([
  ".git",
  ".texpulse",
  "coverage",
  "dist",
  "node_modules",
]);

interface ExportEntry {
  absolutePath: string;
  modifiedAt: Date;
  path: string;
}

interface CentralDirectoryEntry {
  crc32: number;
  localHeaderOffset: number;
  modifiedAt: Date;
  pathBytes: Buffer;
  size: number;
}

export interface ProjectZipSummary {
  files: number;
  skippedLinks: number;
  totalBytes: number;
}

export async function exportProjectZip(
  projectDirectory: string,
  destinationPath: string,
): Promise<ProjectZipSummary> {
  const root = await canonicalProjectRoot(projectDirectory);
  const metadata = await loadProjectMetadata(root);
  const destination = resolve(destinationPath);
  const entries: ExportEntry[] = [];
  let skippedLinks = 0;

  const visit = async (directory: string): Promise<void> => {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const absolutePath = resolve(directory, child.name);
      const projectPath = toPortableProjectPath(relative(root, absolutePath));
      const entryStat = await lstat(absolutePath);
      if (entryStat.isSymbolicLink()) {
        skippedLinks += 1;
        continue;
      }
      if (
        entryStat.isDirectory() &&
        shouldIgnoreDirectory(projectPath, metadata.metadata.buildDirectory)
      ) {
        continue;
      }
      if (entryStat.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (
        !entryStat.isFile() ||
        pathKey(absolutePath) === pathKey(destination)
      ) {
        continue;
      }
      entries.push({
        absolutePath,
        modifiedAt: entryStat.mtime,
        path: projectPath,
      });
      if (entries.length > MAX_ZIP_ENTRIES) {
        throw new Error(
          `ZIP export supports at most ${String(MAX_ZIP_ENTRIES)} files.`,
        );
      }
    }
  };

  await visit(root);
  const temporaryPath = resolve(
    dirname(destination),
    `.${basename(destination)}.${randomUUID()}.tmp`,
  );
  const handle = await open(temporaryPath, "wx");
  try {
    const summary = await writeZip(handle, entries, skippedLinks);
    await handle.sync();
    await handle.close();
    await replaceFile(temporaryPath, destination);
    return summary;
  } catch (error) {
    await handle.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function writeZip(
  handle: FileHandle,
  entries: readonly ExportEntry[],
  skippedLinks: number,
): Promise<ProjectZipSummary> {
  let offset = 0;
  let totalBytes = 0;
  const centralEntries: CentralDirectoryEntry[] = [];

  for (const entry of entries) {
    const pathBytes = Buffer.from(entry.path, "utf8");
    if (pathBytes.length > 0xffff) {
      throw new Error(`ZIP entry path is too long: ${entry.path}`);
    }
    const localHeaderOffset = offset;
    const localHeader = localFileHeader(pathBytes, entry.modifiedAt);
    offset += await writeAll(handle, localHeader);
    offset += await writeAll(handle, pathBytes);

    let crc32 = 0xffff_ffff;
    let size = 0;
    for await (const value of createReadStream(entry.absolutePath)) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      size += chunk.length;
      totalBytes += chunk.length;
      if (size > MAX_ZIP_VALUE || offset + chunk.length > MAX_ZIP_VALUE) {
        throw new Error("ZIP64 output is not supported by this release.");
      }
      crc32 = updateCrc32(crc32, chunk);
      offset += await writeAll(handle, chunk);
    }
    crc32 = (crc32 ^ 0xffff_ffff) >>> 0;
    offset += await writeAll(handle, dataDescriptor(crc32, size));
    centralEntries.push({
      crc32,
      localHeaderOffset,
      modifiedAt: entry.modifiedAt,
      pathBytes,
      size,
    });
  }

  const centralDirectoryOffset = offset;
  for (const entry of centralEntries) {
    const header = centralDirectoryHeader(entry);
    offset += await writeAll(handle, header);
    offset += await writeAll(handle, entry.pathBytes);
  }
  const centralDirectorySize = offset - centralDirectoryOffset;
  if (
    centralDirectoryOffset > MAX_ZIP_VALUE ||
    centralDirectorySize > MAX_ZIP_VALUE
  ) {
    throw new Error("ZIP64 output is not supported by this release.");
  }
  offset += await writeAll(
    handle,
    endOfCentralDirectory(
      centralEntries.length,
      centralDirectorySize,
      centralDirectoryOffset,
    ),
  );
  if (offset > MAX_ZIP_VALUE) {
    throw new Error("ZIP64 output is not supported by this release.");
  }
  return { files: entries.length, skippedLinks, totalBytes };
}

function localFileHeader(pathBytes: Buffer, modifiedAt: Date): Buffer {
  const { date, time } = dosDateTime(modifiedAt);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0808, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(time, 10);
  header.writeUInt16LE(date, 12);
  header.writeUInt16LE(pathBytes.length, 26);
  return header;
}

function dataDescriptor(crc32: number, size: number): Buffer {
  const descriptor = Buffer.alloc(16);
  descriptor.writeUInt32LE(0x08074b50, 0);
  descriptor.writeUInt32LE(crc32, 4);
  descriptor.writeUInt32LE(size, 8);
  descriptor.writeUInt32LE(size, 12);
  return descriptor;
}

function centralDirectoryHeader(entry: CentralDirectoryEntry): Buffer {
  const { date, time } = dosDateTime(entry.modifiedAt);
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0808, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(time, 12);
  header.writeUInt16LE(date, 14);
  header.writeUInt32LE(entry.crc32, 16);
  header.writeUInt32LE(entry.size, 20);
  header.writeUInt32LE(entry.size, 24);
  header.writeUInt16LE(entry.pathBytes.length, 28);
  header.writeUInt32LE(entry.localHeaderOffset, 42);
  return header;
}

function endOfCentralDirectory(
  entries: number,
  directorySize: number,
  directoryOffset: number,
): Buffer {
  const record = Buffer.alloc(22);
  record.writeUInt32LE(0x06054b50, 0);
  record.writeUInt16LE(entries, 8);
  record.writeUInt16LE(entries, 10);
  record.writeUInt32LE(directorySize, 12);
  record.writeUInt32LE(directoryOffset, 16);
  return record;
}

function dosDateTime(value: Date): { date: number; time: number } {
  const year = Math.min(Math.max(value.getFullYear(), 1980), 2107);
  return {
    date:
      ((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate(),
    time:
      (value.getHours() << 11) |
      (value.getMinutes() << 5) |
      Math.floor(value.getSeconds() / 2),
  };
}

async function writeAll(handle: FileHandle, buffer: Buffer): Promise<number> {
  let written = 0;
  while (written < buffer.length) {
    const result = await handle.write(
      buffer,
      written,
      buffer.length - written,
      null,
    );
    if (result.bytesWritten === 0) {
      throw new Error("ZIP export stopped before all bytes were written.");
    }
    written += result.bytesWritten;
  }
  return written;
}

function updateCrc32(crc32: number, bytes: Buffer): number {
  let value = crc32;
  for (const byte of bytes) {
    value = CRC32_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8);
  }
  return value >>> 0;
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function shouldIgnoreDirectory(
  projectPath: string,
  buildDirectory: string,
): boolean {
  const key = pathKey(projectPath);
  const buildKey = pathKey(buildDirectory);
  const firstComponent = projectPath.split("/")[0]?.toLowerCase();
  return (
    (firstComponent !== undefined &&
      IGNORED_TOP_LEVEL_DIRECTORIES.has(firstComponent)) ||
    key === buildKey ||
    key.startsWith(`${buildKey}/`)
  );
}

async function replaceFile(
  temporaryPath: string,
  destinationPath: string,
): Promise<void> {
  try {
    await rename(temporaryPath, destinationPath);
  } catch (error) {
    const destinationStat = await stat(destinationPath).catch(() => null);
    if (destinationStat === null || !destinationStat.isFile()) {
      throw error;
    }
    await rm(destinationPath);
    await rename(temporaryPath, destinationPath);
  }
}

function pathKey(path: string): string {
  return process.platform === "win32" ? path.toLocaleLowerCase("en-US") : path;
}
