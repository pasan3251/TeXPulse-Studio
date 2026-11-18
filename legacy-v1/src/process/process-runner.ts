import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

export interface ProcessInvocation {
  executable: string;
  args: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  maxOutputBytes?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export const DEFAULT_MAX_PROCESS_OUTPUT_BYTES = 8 * 1024 * 1024;

export type ProcessTerminationReason =
  | "cancelled"
  | "output-limit"
  | "timed-out";

export interface ProcessResult {
  executable: string;
  args: readonly string[];
  cwd: string | null;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  outputTruncated: boolean;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  error: string | null;
  terminationReason: ProcessTerminationReason | null;
  terminationError: string | null;
}

export interface ProcessRunner {
  run(invocation: ProcessInvocation): Promise<ProcessResult>;
}

function terminatePosixProcessGroup(child: ChildProcess): string | null {
  if (child.pid === undefined) {
    return "The compiler process did not expose a process ID.";
  }

  try {
    process.kill(-child.pid, "SIGKILL");
    return null;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") {
      return null;
    }

    try {
      child.kill("SIGKILL");
    } catch {
      // Preserve the process-group error because it explains the cleanup risk.
    }
    return error instanceof Error
      ? error.message
      : "Failed to terminate the compiler process group.";
  }
}

function terminateWindowsProcessTree(
  child: ChildProcess,
): Promise<string | null> {
  if (child.pid === undefined) {
    return Promise.resolve("The compiler process did not expose a process ID.");
  }

  const taskkillPath = join(
    process.env.SystemRoot ?? "C:\\Windows",
    "System32",
    "taskkill.exe",
  );

  return new Promise((resolve) => {
    const stderr: Buffer[] = [];
    let stderrBytes = 0;
    const killer = spawn(
      taskkillPath,
      ["/PID", String(child.pid), "/T", "/F"],
      {
        shell: false,
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true,
      },
    );

    killer.stderr.on("data", (chunk: Buffer) => {
      const remaining = Math.max(8_192 - stderrBytes, 0);
      if (remaining > 0) {
        stderr.push(chunk.subarray(0, remaining));
        stderrBytes += Math.min(chunk.length, remaining);
      }
    });
    killer.on("error", (error) => {
      try {
        child.kill("SIGKILL");
      } catch {
        // The taskkill error below remains the actionable cleanup result.
      }
      resolve(error.message);
    });
    killer.on("close", (exitCode) => {
      if (
        exitCode === 0 ||
        child.exitCode !== null ||
        child.signalCode !== null
      ) {
        resolve(null);
        return;
      }

      try {
        child.kill("SIGKILL");
      } catch {
        // Report taskkill's error because the direct fallback is best effort.
      }
      const detail = Buffer.concat(stderr).toString("utf8").trim();
      resolve(
        detail === ""
          ? `taskkill exited with code ${String(exitCode)}.`
          : detail,
      );
    });
  });
}

function terminateProcessTree(child: ChildProcess): Promise<string | null> {
  return process.platform === "win32"
    ? terminateWindowsProcessTree(child)
    : Promise.resolve(terminatePosixProcessGroup(child));
}

export class NodeProcessRunner implements ProcessRunner {
  run(invocation: ProcessInvocation): Promise<ProcessResult> {
    const startedAt = new Date();
    const startTime = performance.now();
    const maxOutputBytes =
      invocation.maxOutputBytes ?? DEFAULT_MAX_PROCESS_OUTPUT_BYTES;
    if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes <= 0) {
      return Promise.reject(
        new Error("Process output limit must be a positive safe integer."),
      );
    }

    return new Promise((resolve) => {
      const child = spawn(invocation.executable, [...invocation.args], {
        cwd: invocation.cwd,
        detached: process.platform !== "win32",
        env: invocation.env,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let capturedOutputBytes = 0;
      let outputTruncated = false;
      let spawnError: string | null = null;
      let terminationReason: ProcessTerminationReason | null = null;
      let terminationPromise: Promise<string | null> | null = null;
      let timeout: NodeJS.Timeout | undefined;

      const requestTermination = (reason: ProcessTerminationReason): void => {
        if (terminationReason !== null) {
          return;
        }
        terminationReason = reason;
        terminationPromise = terminateProcessTree(child);
      };
      const handleAbort = (): void => {
        requestTermination("cancelled");
      };
      const captureOutput = (target: Buffer[], chunk: Buffer): void => {
        const remaining = Math.max(maxOutputBytes - capturedOutputBytes, 0);
        if (remaining > 0) {
          target.push(chunk.subarray(0, remaining));
          capturedOutputBytes += Math.min(chunk.length, remaining);
        }
        if (chunk.length > remaining) {
          outputTruncated = true;
          requestTermination("output-limit");
        }
      };

      child.stdout.on("data", (chunk: Buffer) => {
        captureOutput(stdout, chunk);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        captureOutput(stderr, chunk);
      });
      child.on("error", (error) => {
        spawnError = error.message;
      });
      child.on("close", async (exitCode, signal) => {
        if (timeout !== undefined) {
          clearTimeout(timeout);
        }
        invocation.signal?.removeEventListener("abort", handleAbort);
        const terminationError =
          terminationPromise === null ? null : await terminationPromise;
        const endedAt = new Date();

        resolve({
          executable: invocation.executable,
          args: [...invocation.args],
          cwd: invocation.cwd ?? null,
          exitCode,
          signal,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
          outputTruncated,
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
          durationMs: Math.round(performance.now() - startTime),
          error: spawnError,
          terminationReason,
          terminationError,
        });
      });

      if (invocation.signal?.aborted === true) {
        requestTermination("cancelled");
      } else {
        invocation.signal?.addEventListener("abort", handleAbort, {
          once: true,
        });
      }

      if (
        invocation.timeoutMs !== undefined &&
        invocation.timeoutMs > 0 &&
        terminationReason === null
      ) {
        timeout = setTimeout(() => {
          requestTermination("timed-out");
        }, invocation.timeoutMs);
      }
    });
  }
}
