import { basename } from "node:path";

import type { IpcMain, IpcMainInvokeEvent } from "electron/main";
import type { ZodType } from "zod";

import {
  openProjectRequestSchema,
  openProjectResultSchema,
  PROJECT_CHANNELS,
  projectPathRequestSchema,
  projectWriteRequestSchema,
  readTextFileResultSchema,
  writeTextFileResultSchema,
  type OpenProjectResult,
  type ReadTextFileResult,
  type WriteTextFileResult,
} from "../ipc/project-contracts.js";
import { ProjectService } from "../project/project-service.js";
import { ProjectError } from "../project/project-types.js";

export interface ProjectIpcOptions {
  ipcMain: Pick<IpcMain, "handle" | "removeHandler">;
  selectProjectDirectory: () => Promise<string | null>;
  trustedWebContentsId: () => number | null;
}

interface ApiFailure {
  ok: false;
  error: {
    code:
      | ProjectError["code"]
      | "cancelled"
      | "internal"
      | "invalid-request"
      | "no-project"
      | "unauthorized";
    message: string;
    projectPath: string | null;
  };
}

export function registerProjectIpc(options: ProjectIpcOptions): () => void {
  let projectService: ProjectService | null = null;

  registerHandler(
    options,
    PROJECT_CHANNELS.open,
    openProjectRequestSchema,
    openProjectResultSchema,
    async (): Promise<OpenProjectResult> => {
      const selectedDirectory = await options.selectProjectDirectory();
      if (selectedDirectory === null) {
        return failure("cancelled", "Project selection was cancelled.");
      }

      const service = await ProjectService.open(selectedDirectory);
      const [entries, rootCandidates] = await Promise.all([
        service.listEntries(),
        service.detectRootFiles(),
      ]);
      projectService = service;
      return {
        ok: true,
        value: {
          name: basename(service.root),
          entries,
          rootCandidates,
        },
      };
    },
  );

  registerHandler(
    options,
    PROJECT_CHANNELS.readTextFile,
    projectPathRequestSchema,
    readTextFileResultSchema,
    async (request): Promise<ReadTextFileResult> => {
      if (projectService === null) {
        return failure("no-project", "Open a project before reading files.");
      }
      return {
        ok: true,
        value: await projectService.readTextFile(request.path),
      };
    },
  );

  registerHandler(
    options,
    PROJECT_CHANNELS.writeTextFile,
    projectWriteRequestSchema,
    writeTextFileResultSchema,
    async (request): Promise<WriteTextFileResult> => {
      if (projectService === null) {
        return failure("no-project", "Open a project before saving files.");
      }
      return {
        ok: true,
        value: await projectService.writeTextFile(
          request.path,
          request.content,
          request.expectedVersion,
        ),
      };
    },
  );

  return () => {
    for (const channel of Object.values(PROJECT_CHANNELS)) {
      options.ipcMain.removeHandler(channel);
    }
  };
}

function registerHandler<Request, Response>(
  options: ProjectIpcOptions,
  channel: string,
  requestSchema: ZodType<Request>,
  responseSchema: ZodType<Response>,
  handler: (request: Request) => Promise<Response>,
): void {
  options.ipcMain.handle(
    channel,
    async (event: IpcMainInvokeEvent, payload: unknown): Promise<Response> => {
      const trustedWebContentsId = options.trustedWebContentsId();
      if (
        trustedWebContentsId === null ||
        event.sender.id !== trustedWebContentsId ||
        event.senderFrame !== event.sender.mainFrame
      ) {
        console.warn(`[security] Rejected untrusted IPC call on ${channel}.`);
        return responseSchema.parse(
          failure("unauthorized", "IPC sender is not trusted."),
        );
      }

      const parsed = requestSchema.safeParse(payload);
      if (!parsed.success) {
        console.warn(`[security] Rejected invalid IPC payload on ${channel}.`);
        return responseSchema.parse(
          failure("invalid-request", "IPC request was invalid."),
        );
      }

      try {
        return responseSchema.parse(await handler(parsed.data));
      } catch (error) {
        if (error instanceof ProjectError) {
          return responseSchema.parse(
            failure(error.code, error.message, error.projectPath),
          );
        }
        console.error(`IPC handler failed on ${channel}.`, error);
        return responseSchema.parse(
          failure("internal", "The requested operation failed."),
        );
      }
    },
  );
}

function failure(
  code: ApiFailure["error"]["code"],
  message: string,
  projectPath: string | null = null,
): ApiFailure {
  return { ok: false, error: { code, message, projectPath } };
}
