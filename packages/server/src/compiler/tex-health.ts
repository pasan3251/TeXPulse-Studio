import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { delimiter, extname, join } from "node:path";
import type { TexEnvironmentHealth, TexToolHealth } from "@texpulse/shared";

export const REQUIRED_TEX_TOOLS = ["pdflatex", "latexmk", "synctex"] as const;

/**
 * Resolves a command name against `PATH` (`PATHEXT`-aware on Windows).
 */
export async function probeExecutableOnPath(
  command: string,
  envPath: string | undefined = process.env.PATH,
  platform: NodeJS.Platform = process.platform,
  pathExt: string | undefined = process.env.PATHEXT,
): Promise<string | null> {
  if (!envPath || envPath.trim() === "") return null;

  const pathSep = platform === "win32" ? ";" : delimiter;
  const dirs = envPath
    .split(pathSep)
    .map((d) => d.trim().replace(/^"+|"+$/gu, ""))
    .filter((d) => d.length > 0);

  const extensions =
    platform === "win32"
      ? extname(command) !== ""
        ? [""]
        : (pathExt || ".COM;.EXE;.BAT;.CMD")
            .split(";")
            .map((e) => e.trim())
            .filter((e) => e.length > 0)
      : [""];

  for (const dir of dirs) {
    for (const ext of extensions) {
      const candidate = join(dir, `${command}${ext}`);
      try {
        const info = await stat(candidate);
        if (!info.isFile()) continue;
        if (platform !== "win32") {
          await access(candidate, constants.X_OK);
        }
        return candidate;
      } catch {
        // Continue scanning remaining PATH entries
      }
    }
  }

  return null;
}

/**
 * Probes required TeX distribution binaries (`pdflatex`, `latexmk`, `synctex`).
 */
export async function probeTexEnvironment(
  env: Readonly<Record<string, string | undefined>> = process.env,
  platform: NodeJS.Platform = process.platform,
): Promise<TexEnvironmentHealth> {
  const tools: TexToolHealth[] = await Promise.all(
    REQUIRED_TEX_TOOLS.map(async (name) => {
      const resolved = await probeExecutableOnPath(
        name,
        env.PATH ?? env.Path,
        platform,
        env.PATHEXT,
      );
      return {
        name,
        available: resolved !== null,
        path: resolved,
      };
    }),
  );

  const missing = tools.filter((t) => !t.available).map((t) => t.name);
  return {
    healthy: missing.length === 0,
    missing,
    tools,
  };
}
