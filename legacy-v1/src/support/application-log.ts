import {
  appendFile,
  mkdir,
  open,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const MAX_LOG_FILE_BYTES = 1024 * 1024;
const MAX_LOG_ENTRY_BYTES = 64 * 1024;
const MAX_LOG_VALUE_CHARACTERS = 2_048;

type LogValue = boolean | number | string | null;

export class ApplicationLog {
  private readonly logPath: string;
  private tail: Promise<void> = Promise.resolve();

  constructor(userDataDirectory: string) {
    this.logPath = join(userDataDirectory, "logs", "application.jsonl");
  }

  record(
    level: "error" | "info" | "warn",
    event: string,
    details: Readonly<Record<string, LogValue>> = {},
  ): void {
    const baseEntry = {
      timestamp: new Date().toISOString(),
      level,
      event: sanitizeText(event),
      details: Object.fromEntries(
        Object.entries(details).map(([key, value]) => [
          sanitizeText(key),
          typeof value === "string" ? sanitizeText(value) : value,
        ]),
      ),
    };
    let entry = `${JSON.stringify(baseEntry)}\n`;
    if (Buffer.byteLength(entry, "utf8") > MAX_LOG_ENTRY_BYTES) {
      entry = `${JSON.stringify({
        ...baseEntry,
        details: { truncated: true },
      })}\n`;
    }
    this.tail = this.tail
      .then(() => this.append(entry))
      .catch((error: unknown) => {
        console.error("Application diagnostic logging failed.", error);
      });
  }

  async exportTo(
    path: string,
    redactionPaths: readonly string[],
  ): Promise<void> {
    await this.tail;
    const contents = await Promise.all([
      readBoundedLog(`${this.logPath}.1`),
      readBoundedLog(this.logPath),
    ]);
    const redacted = redactSupportText(
      contents.filter((content) => content !== "").join(""),
      [homedir(), ...redactionPaths],
    );
    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      path,
      `TeXPulse Studio support log\nExported: ${new Date().toISOString()}\n\n${redacted}`,
      "utf8",
    );
  }

  async clear(): Promise<void> {
    await this.tail;
    await Promise.all([
      rm(this.logPath, { force: true }),
      rm(`${this.logPath}.1`, { force: true }),
    ]);
  }

  private async append(entry: string): Promise<void> {
    await mkdir(dirname(this.logPath), { recursive: true });
    const currentBytes = await stat(this.logPath)
      .then((value) => value.size)
      .catch(() => 0);
    if (currentBytes + Buffer.byteLength(entry, "utf8") > MAX_LOG_FILE_BYTES) {
      await rm(`${this.logPath}.1`, { force: true });
      await rename(this.logPath, `${this.logPath}.1`).catch(
        (error: unknown) => {
          if (
            !(error instanceof Error) ||
            !("code" in error) ||
            (error as NodeJS.ErrnoException).code !== "ENOENT"
          ) {
            throw error;
          }
        },
      );
    }
    await appendFile(this.logPath, entry, "utf8");
  }
}

async function readBoundedLog(path: string): Promise<string> {
  const handle = await open(path, "r").catch((error: unknown) => {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  });
  if (handle === null) {
    return "";
  }
  try {
    const buffer = Buffer.alloc(MAX_LOG_FILE_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const text = buffer
      .subarray(0, Math.min(bytesRead, MAX_LOG_FILE_BYTES))
      .toString("utf8");
    return bytesRead > MAX_LOG_FILE_BYTES
      ? `${text}\n[Log file truncated during export.]\n`
      : text;
  } finally {
    await handle.close();
  }
}

export function redactSupportText(
  text: string,
  paths: readonly string[],
): string {
  let redacted = text;
  const uniquePaths = [
    ...new Set(paths.filter((path) => path.trim() !== "")),
  ].sort((left, right) => right.length - left.length);
  for (const path of uniquePaths) {
    for (const candidate of [path, JSON.stringify(path).slice(1, -1)]) {
      redacted = redacted.replaceAll(candidate, "<redacted-path>");
    }
  }
  return redacted;
}

function sanitizeText(value: string): string {
  const normalized = [...value]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 || code === 9 || code === 10 || code === 13;
    })
    .join("");
  return normalized.length <= MAX_LOG_VALUE_CHARACTERS
    ? normalized
    : `${normalized.slice(0, MAX_LOG_VALUE_CHARACTERS - 3)}...`;
}
