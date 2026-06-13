import { spawn } from "node:child_process";

export interface ProcessInvocation {
  executable: string;
  args: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

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
}

export interface ProcessRunner {
  run(invocation: ProcessInvocation): Promise<ProcessResult>;
}

export class NodeProcessRunner implements ProcessRunner {
  run(invocation: ProcessInvocation): Promise<ProcessResult> {
    const startedAt = new Date();
    const startTime = performance.now();

    return new Promise((resolve) => {
      const child = spawn(invocation.executable, [...invocation.args], {
        cwd: invocation.cwd,
        env: invocation.env,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let spawnError: string | null = null;

      child.stdout.on("data", (chunk: Buffer) => {
        stdout.push(chunk);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr.push(chunk);
      });
      child.on("error", (error) => {
        spawnError = error.message;
      });
      child.on("close", (exitCode, signal) => {
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
        });
      });
    });
  }
}
