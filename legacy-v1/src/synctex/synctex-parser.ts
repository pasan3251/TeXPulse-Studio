import type {
  ForwardSyncTarget,
  InverseSyncTarget,
} from "../ipc/synctex-contracts.js";

const MAX_SYNCTEX_OUTPUT_CHARACTERS = 512 * 1024;

export function parseForwardSyncOutput(
  output: string,
): ForwardSyncTarget | null {
  const fields = parseFields(output);
  const page = positiveInteger(fields.get("Page"));
  const x = nonnegativeNumber(fields.get("x"));
  const y = nonnegativeNumber(fields.get("y"));
  if (page === null || x === null || y === null) {
    return null;
  }
  return {
    page,
    x,
    y,
    width: nonnegativeNumber(fields.get("W")) ?? 0,
    height: nonnegativeNumber(fields.get("H")) ?? 0,
  };
}

export function parseInverseSyncOutput(
  output: string,
  projectFiles: readonly string[],
): InverseSyncTarget | null {
  const fields = parseFields(output);
  const path = resolveKnownFile(fields.get("Input") ?? "", projectFiles);
  const line = positiveInteger(fields.get("Line"));
  if (path === null || line === null) {
    return null;
  }
  return {
    path,
    line,
    column: positiveInteger(fields.get("Column")),
  };
}

function parseFields(output: string): Map<string, string> {
  if (output.length > MAX_SYNCTEX_OUTPUT_CHARACTERS) {
    return new Map();
  }
  const begin = output.indexOf("SyncTeX result begin");
  const end = output.indexOf("SyncTeX result end", begin);
  if (begin < 0 || end < 0) {
    return new Map();
  }
  const fields = new Map<string, string>();
  for (const line of output.slice(begin, end).split(/\r?\n/u)) {
    const separator = line.indexOf(":");
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    if (!fields.has(key)) {
      fields.set(key, line.slice(separator + 1).trim());
    }
  }
  return fields;
}

function resolveKnownFile(
  candidate: string,
  projectFiles: readonly string[],
): string | null {
  const normalized = normalizePortablePath(candidate);
  if (normalized === "") {
    return null;
  }
  const key = normalized.toLocaleLowerCase("en-US");
  return (
    projectFiles
      .map(normalizePortablePath)
      .filter((path) => path !== "")
      .sort((left, right) => right.length - left.length)
      .find((path) => {
        const pathKey = path.toLocaleLowerCase("en-US");
        return key === pathKey || key.endsWith(`/${pathKey}`);
      }) ?? null
  );
}

function normalizePortablePath(path: string): string {
  return path.trim().replaceAll("\\", "/").replace(/\/+/gu, "/");
}

function positiveInteger(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function nonnegativeNumber(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
