import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { IpcMain, IpcMainInvokeEvent } from "electron/main";
import { afterEach, describe, expect, it, vi } from "vitest";

import { registerProjectIpc } from "../../src/electron/project-ipc.js";
import { PROJECT_CHANNELS } from "../../src/ipc/project-contracts.js";

type IpcHandler = Parameters<IpcMain["handle"]>[1];

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function createProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "texpulse-ipc-"));
  temporaryDirectories.push(root);
  await writeFile(join(root, "main.tex"), "\\documentclass{article}");
  return root;
}

function createFakeIpcMain() {
  const handlers = new Map<string, IpcHandler>();
  const ipcMain = {
    handle(channel: string, listener: IpcHandler) {
      handlers.set(channel, listener);
    },
    removeHandler(channel: string) {
      handlers.delete(channel);
    },
  } satisfies Pick<IpcMain, "handle" | "removeHandler">;
  return { handlers, ipcMain };
}

function event(senderId: number, mainFrame = true): IpcMainInvokeEvent {
  const frame = {};
  const senderFrame = mainFrame ? frame : {};
  return {
    sender: { id: senderId, mainFrame: frame },
    senderFrame,
  } as unknown as IpcMainInvokeEvent;
}

async function invoke(
  handlers: Map<string, IpcHandler>,
  channel: string,
  ipcEvent: IpcMainInvokeEvent,
  payload?: unknown,
): Promise<unknown> {
  const handler = handlers.get(channel);
  if (handler === undefined) {
    throw new Error(`Missing fake IPC handler: ${channel}`);
  }
  return handler(ipcEvent, payload);
}

describe("project IPC", () => {
  it("opens a project and reads only through the active bounded session", async () => {
    const root = await createProject();
    const { handlers, ipcMain } = createFakeIpcMain();
    registerProjectIpc({
      ipcMain,
      selectProjectDirectory: () => Promise.resolve(root),
      trustedWebContentsId: () => 7,
    });

    await expect(
      invoke(handlers, PROJECT_CHANNELS.open, event(7)),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        name: expect.any(String),
        entries: [{ path: "main.tex", kind: "file" }],
      },
    });
    await expect(
      invoke(handlers, PROJECT_CHANNELS.readTextFile, event(7), {
        path: "main.tex",
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: { path: "main.tex", content: "\\documentclass{article}" },
    });
    await expect(
      invoke(handlers, PROJECT_CHANNELS.readTextFile, event(7), {
        path: "../outside.tex",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "path-escape" },
    });
  });

  it("rejects untrusted senders and malformed payloads with diagnostics", async () => {
    const { handlers, ipcMain } = createFakeIpcMain();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerProjectIpc({
      ipcMain,
      selectProjectDirectory: () => Promise.resolve(null),
      trustedWebContentsId: () => 7,
    });

    await expect(
      invoke(handlers, PROJECT_CHANNELS.readTextFile, event(99), {
        path: "main.tex",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "unauthorized" },
    });
    await expect(
      invoke(handlers, PROJECT_CHANNELS.open, event(7), {
        unexpected: true,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid-request" },
    });
    await expect(
      invoke(handlers, PROJECT_CHANNELS.readTextFile, event(7), {
        path: "main.tex",
        unexpected: true,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid-request" },
    });
    expect(warning).toHaveBeenCalledTimes(3);
  });
});
