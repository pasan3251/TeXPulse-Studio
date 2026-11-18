import { stat } from "node:fs/promises";
import { posix, win32 } from "node:path";

export interface ExecutableDiscoveryOptions {
  customBinDirectory?: string;
  pathValue?: string;
  pathExtensions?: string;
  platform?: NodeJS.Platform;
  isExecutable?: (path: string) => Promise<boolean>;
}

async function defaultIsExecutable(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function executableNames(
  command: string,
  platform: NodeJS.Platform,
  pathExtensions: string | undefined,
): string[] {
  const pathApi = platform === "win32" ? win32 : posix;
  if (platform !== "win32" || pathApi.extname(command) !== "") {
    return [command];
  }

  const extensions = (pathExtensions ?? ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((extension) => extension.trim())
    .filter(Boolean);

  return extensions.map((extension) => `${command}${extension.toLowerCase()}`);
}

export async function discoverExecutable(
  command: string,
  options: ExecutableDiscoveryOptions = {},
): Promise<string | null> {
  const platform = options.platform ?? process.platform;
  const pathApi = platform === "win32" ? win32 : posix;
  const isExecutable = options.isExecutable ?? defaultIsExecutable;
  const names = executableNames(command, platform, options.pathExtensions);

  if (pathApi.isAbsolute(command)) {
    return (await isExecutable(command)) ? command : null;
  }

  const directories = [
    ...(options.customBinDirectory
      ? [pathApi.resolve(options.customBinDirectory)]
      : []),
    ...(options.pathValue ?? process.env.PATH ?? "")
      .split(platform === "win32" ? ";" : ":")
      .map((directory) => directory.trim())
      .filter(Boolean),
  ];
  const seen = new Set<string>();

  for (const directory of directories) {
    for (const name of names) {
      const candidate = pathApi.resolve(directory, name);
      const key = platform === "win32" ? candidate.toLowerCase() : candidate;

      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      if (await isExecutable(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}
