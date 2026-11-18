import { lstat, readFile, readdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import {
  LocalProjectStore,
  ProjectPathError,
  normalizeProjectPath,
} from "./project-store.js";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".texpulse",
  ".texpulse-cache",
  "__macosx",
  "coverage",
  "dist",
  "legacy-v1",
  "node_modules",
]);

const MAX_ZIP_ENTRIES = 1000;
const MAX_ZIP_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ZIP_TOTAL_BYTES = 50 * 1024 * 1024;

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function computeCrc32(bytes: Uint8Array): number {
  let value = 0xffff_ffff;
  for (const byte of bytes) {
    value = CRC32_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8);
  }
  return (value ^ 0xffff_ffff) >>> 0;
}

function dosDateTime(value: Date): { date: number; time: number } {
  const year = Math.min(Math.max(value.getFullYear(), 1980), 2107);
  return {
    date: ((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate(),
    time:
      (value.getHours() << 11) |
      (value.getMinutes() << 5) |
      Math.floor(value.getSeconds() / 2),
  };
}

/**
 * Exports all workspace source/asset files into an Overleaf-compatible `.zip`
 * buffer, strictly excluding `.git`, `.texpulse`, and `.texpulse-cache`.
 */
export async function exportProjectZipBuffer(projectRoot: string): Promise<Buffer> {
  const canonicalRoot = resolve(projectRoot);
  const files: Array<{ portablePath: string; bytes: Buffer; modifiedAt: Date }> = [];
  let totalBytes = 0;

  const visit = async (dir: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (IGNORED_DIRECTORIES.has(entry.name.toLowerCase())) continue;
      const abs = resolve(dir, entry.name);
      const info = await lstat(abs);
      if (info.isSymbolicLink()) continue;
      if (info.isDirectory()) {
        await visit(abs);
        continue;
      }
      if (!info.isFile()) continue;
      if (info.size > MAX_ZIP_FILE_BYTES) {
        throw new Error(`File exceeds ZIP export limit: ${entry.name}`);
      }
      totalBytes += info.size;
      if (totalBytes > MAX_ZIP_TOTAL_BYTES || files.length >= MAX_ZIP_ENTRIES) {
        throw new Error("Project exceeds ZIP export size or entry limits.");
      }
      const portablePath = relative(canonicalRoot, abs).split(sep).join("/");
      const bytes = await readFile(abs);
      files.push({ portablePath, bytes, modifiedAt: info.mtime });
    }
  };

  await visit(canonicalRoot);

  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = Buffer.from(file.portablePath, "utf8");
    const crc = computeCrc32(file.bytes);
    const compressed = deflateRawSync(file.bytes);
    const { date, time } = dosDateTime(file.modifiedAt);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    localHeader.writeUInt16LE(8, 8); // DEFLATE
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(file.bytes.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(date, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(file.bytes.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    localParts.push(localHeader, nameBytes, compressed);
    centralParts.push(centralHeader, nameBytes);
    offset += localHeader.length + nameBytes.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

function findEocdOffset(zipBuffer: Buffer): number {
  const minOffset = Math.max(0, zipBuffer.length - 65_557);
  for (let i = zipBuffer.length - 22; i >= minOffset; i -= 1) {
    if (zipBuffer.readUInt32LE(i) === 0x06054b50) {
      const commentLen = zipBuffer.readUInt16LE(i + 20);
      if (i + 22 + commentLen === zipBuffer.length) {
        return i;
      }
    }
  }
  throw new Error("Invalid ZIP archive: End of Central Directory not found.");
}

export interface ZipImportResult {
  importedPaths: string[];
  skippedPaths: string[];
}

/**
 * Safely unpacks an Overleaf-style `.zip` archive into `store`, enforcing
 * path-traversal checks, CRC-32 verification, and zip-bomb byte caps.
 */
export async function importProjectZipBuffer(
  store: LocalProjectStore,
  zipBuffer: Buffer,
): Promise<ZipImportResult> {
  if (zipBuffer.length < 22 || zipBuffer.length > MAX_ZIP_TOTAL_BYTES) {
    throw new Error("ZIP archive is empty or exceeds maximum upload size.");
  }

  const eocdOffset = findEocdOffset(zipBuffer);
  const entryCount = zipBuffer.readUInt16LE(eocdOffset + 10);
  const centralSize = zipBuffer.readUInt32LE(eocdOffset + 12);
  const centralOffset = zipBuffer.readUInt32LE(eocdOffset + 16);

  if (entryCount > MAX_ZIP_ENTRIES) {
    throw new Error("ZIP archive exceeds maximum entry limit.");
  }
  if (centralOffset + centralSize > eocdOffset) {
    throw new Error("Corrupted ZIP central directory bounds.");
  }

  interface ParsedEntry {
    rawPath: string;
    method: number;
    expectedCrc: number;
    compressedSize: number;
    uncompressedSize: number;
    localHeaderOffset: number;
  }

  const rawEntries: ParsedEntry[] = [];
  let cursor = centralOffset;
  for (let idx = 0; idx < entryCount; idx += 1) {
    if (cursor + 46 > eocdOffset || zipBuffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error("Corrupted ZIP central directory entry.");
    }
    const method = zipBuffer.readUInt16LE(cursor + 10);
    const expectedCrc = zipBuffer.readUInt32LE(cursor + 16);
    const compressedSize = zipBuffer.readUInt32LE(cursor + 20);
    const uncompressedSize = zipBuffer.readUInt32LE(cursor + 24);
    const nameLen = zipBuffer.readUInt16LE(cursor + 28);
    const extraLen = zipBuffer.readUInt16LE(cursor + 30);
    const commentLen = zipBuffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = zipBuffer.readUInt32LE(cursor + 42);

    const rawPath = zipBuffer
      .subarray(cursor + 46, cursor + 46 + nameLen)
      .toString("utf8");
    cursor += 46 + nameLen + extraLen + commentLen;

    if (rawPath.endsWith("/")) continue;
    rawEntries.push({
      rawPath,
      method,
      expectedCrc,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
  }

  // Strip a shared top-level wrapper folder (e.g. `my-paper/main.tex` -> `main.tex`)
  const firstSegments = new Set(
    rawEntries
      .map((e) => e.rawPath.replaceAll("\\", "/").split("/")[0] ?? "")
      .filter((seg) => seg !== "" && !IGNORED_DIRECTORIES.has(seg.toLowerCase())),
  );
  const allNested = rawEntries.every((e) => e.rawPath.replaceAll("\\", "/").includes("/"));
  const sharedRootPrefix =
    allNested && firstSegments.size === 1 ? `${[...firstSegments][0]!}/` : "";

  const importedPaths: string[] = [];
  const skippedPaths: string[] = [];
  let totalUncompressed = 0;

  for (const entry of rawEntries) {
    let candidatePath = entry.rawPath.replaceAll("\\", "/");
    if (sharedRootPrefix && candidatePath.startsWith(sharedRootPrefix)) {
      candidatePath = candidatePath.slice(sharedRootPrefix.length);
    }

    const segments = candidatePath.split("/").filter(Boolean);
    if (
      segments.length === 0 ||
      segments.some((s) => IGNORED_DIRECTORIES.has(s.toLowerCase()))
    ) {
      skippedPaths.push(entry.rawPath);
      continue;
    }

    let normalizedPath: string;
    try {
      normalizedPath = normalizeProjectPath(candidatePath);
    } catch (error) {
      if (error instanceof ProjectPathError) {
        skippedPaths.push(entry.rawPath);
        continue;
      }
      throw error;
    }

    if (
      entry.uncompressedSize > MAX_ZIP_FILE_BYTES ||
      totalUncompressed + entry.uncompressedSize > MAX_ZIP_TOTAL_BYTES
    ) {
      throw new Error(`ZIP entry exceeds size limits: ${normalizedPath}`);
    }

    const lh = entry.localHeaderOffset;
    if (lh + 30 > centralOffset || zipBuffer.readUInt32LE(lh) !== 0x04034b50) {
      throw new Error(`Corrupted local header for ZIP entry: ${normalizedPath}`);
    }
    const lhNameLen = zipBuffer.readUInt16LE(lh + 26);
    const lhExtraLen = zipBuffer.readUInt16LE(lh + 28);
    const dataStart = lh + 30 + lhNameLen + lhExtraLen;
    const dataEnd = dataStart + entry.compressedSize;
    if (dataEnd > centralOffset) {
      throw new Error(`Compressed data out of bounds: ${normalizedPath}`);
    }

    const compressedSlice = zipBuffer.subarray(dataStart, dataEnd);
    let outputBytes: Buffer;
    if (entry.method === 0) {
      outputBytes = Buffer.from(compressedSlice);
    } else if (entry.method === 8) {
      outputBytes = inflateRawSync(compressedSlice, {
        maxOutputLength: MAX_ZIP_FILE_BYTES,
      });
    } else {
      skippedPaths.push(normalizedPath);
      continue;
    }

    totalUncompressed += outputBytes.length;
    if (totalUncompressed > MAX_ZIP_TOTAL_BYTES) {
      throw new Error("ZIP unpacked payload exceeds total size limit.");
    }
    if (computeCrc32(outputBytes) !== entry.expectedCrc) {
      throw new Error(`CRC-32 mismatch for ZIP entry: ${normalizedPath}`);
    }

    await store.writeProjectBinaryFile(normalizedPath, outputBytes);
    importedPaths.push(normalizedPath);
  }

  return { importedPaths, skippedPaths };
}
