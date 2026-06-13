import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

export interface ProcessInvocation {
  executable: string;
  args: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export type ProcessTerminationReason = "cancelled" | "timed-out";

export interface ProcessResult {
  executable: string;
  args: readonly string[];
  cwd: string | null;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
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
      stderr.push(chunk);
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

      child.stdout.on("data", (chunk: Buffer) => {
        stdout.push(chunk);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr.push(chunk);
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
