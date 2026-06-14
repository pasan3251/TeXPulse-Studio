import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApplicationLog,
  redactSupportText,
} from "../../src/support/application-log.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("application support logs", () => {
  it("redacts plain and JSON-escaped local paths", () => {
    const path = "C:\\Users\\Writer\\Documents\\Paper";
    const input = `${path}\n${JSON.stringify({ path })}`;
    const redacted = redactSupportText(input, ["", path]);

    expect(redacted).not.toContain("Writer");
    expect(redacted).toContain("<redacted-path>");
  });

  it("exports bounded structured events without adding source content", async () => {
    const root = await mkdtemp(join(tmpdir(), "texpulse-log-"));
    temporaryDirectories.push(root);
    const log = new ApplicationLog(root);
    const project = join(root, "private-project");
    const exportPath = join(root, "support.txt");
    log.record("info", "project_opened", {
      project,
      count: 1,
      ready: true,
      optional: null,
    });

    await log.exportTo(exportPath, [project]);
    const exported = await readFile(exportPath, "utf8");
    expect(exported).toContain("project_opened");
    expect(exported).not.toContain("private-project");
    expect(exported).toContain("<redacted-path>");

    await log.clear();
    await expect(
      readFile(join(root, "logs", "application.jsonl"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("sanitizes event values and rotates bounded local log files", async () => {
    const root = await mkdtemp(join(tmpdir(), "texpulse-log-rotation-"));
    temporaryDirectories.push(root);
    const log = new ApplicationLog(root);
    for (let index = 0; index < 600; index += 1) {
      log.record("warn", `event\u0000-${String(index)}`, {
        detail: "x".repeat(3_000),
      });
    }
    const exportPath = join(root, "rotated-support.txt");
    await log.exportTo(exportPath, []);

    await expect(
      stat(join(root, "logs", "application.jsonl.1")),
    ).resolves.toMatchObject({ size: expect.any(Number) });
    const exported = await readFile(exportPath, "utf8");
    expect(exported).not.toContain("\u0000");
    expect(exported).toContain("...");
  }, 15_000);

  it("exports and clears successfully when no log exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "texpulse-empty-log-"));
    temporaryDirectories.push(root);
    const log = new ApplicationLog(root);
    const exportPath = join(root, "empty-support.txt");

    await expect(log.exportTo(exportPath, [])).resolves.toBeUndefined();
    await expect(log.clear()).resolves.toBeUndefined();
    await expect(readFile(exportPath, "utf8")).resolves.toContain(
      "TeXPulse Studio support log",
    );
  });

  it("bounds an externally enlarged log during export", async () => {
    const root = await mkdtemp(join(tmpdir(), "texpulse-external-log-"));
    temporaryDirectories.push(root);
    const logDirectory = join(root, "logs");
    const exportPath = join(root, "bounded-support.txt");
    await mkdir(logDirectory);
    await writeFile(
      join(logDirectory, "application.jsonl"),
      "x".repeat(2 * 1024 * 1024),
    );

    await new ApplicationLog(root).exportTo(exportPath, []);
    const exported = await readFile(exportPath, "utf8");
    expect(exported).toContain("[Log file truncated during export.]");
    expect(Buffer.byteLength(exported, "utf8")).toBeLessThan(1_100_000);
  });

  it("replaces an oversized structured entry with a bounded marker", async () => {
    const root = await mkdtemp(join(tmpdir(), "texpulse-large-entry-"));
    temporaryDirectories.push(root);
    const exportPath = join(root, "bounded-entry.txt");
    const details = Object.fromEntries(
      Array.from({ length: 40 }, (_, index) => [
        `field-${String(index)}`,
        "x".repeat(3_000),
      ]),
    );
    const log = new ApplicationLog(root);

    log.record("warn", "oversized_event", details);
    await log.exportTo(exportPath, []);
    const exported = await readFile(exportPath, "utf8");
    expect(exported).toContain('"details":{"truncated":true}');
    expect(Buffer.byteLength(exported, "utf8")).toBeLessThan(2_048);
  });

  it("contains local logging failures without rejecting callers", async () => {
    const root = await mkdtemp(join(tmpdir(), "texpulse-log-failure-"));
    temporaryDirectories.push(root);
    const invalidUserData = join(root, "not-a-directory");
    const exportedPath = join(root, "support.txt");
    await writeFile(invalidUserData, "file");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = new ApplicationLog(invalidUserData);

    log.record("error", "write_failed");
    await expect(log.exportTo(exportedPath, [])).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledOnce();
  });
});
