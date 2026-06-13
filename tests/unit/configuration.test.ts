import { readFile } from "node:fs/promises";

import { parse } from "yaml";
import { describe, expect, it } from "vitest";

interface PackageManifest {
  dependencies?: Record<string, string>;
  packageManager?: string;
  scripts?: Record<string, string>;
}

interface TypeScriptConfig {
  compilerOptions?: {
    noEmit?: boolean;
    strict?: boolean;
  };
}

interface Workflow {
  jobs?: {
    quality?: {
      "runs-on"?: string;
      steps?: Array<{
        run?: string;
      }>;
    };
  };
  name?: string;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

describe("engineering controls", () => {
  it("pins pnpm and exposes every current quality command", async () => {
    const manifest = await readJson<PackageManifest>("package.json");

    expect(manifest.packageManager).toBe("pnpm@10.12.1");
    expect(manifest.dependencies).toEqual(
      expect.objectContaining({
        codemirror: expect.any(String),
        react: expect.any(String),
        "react-dom": expect.any(String),
        zod: expect.any(String),
      }),
    );
    expect(Object.keys(manifest.scripts ?? {})).toEqual(
      expect.arrayContaining([
        "app:start",
        "build",
        "check",
        "format:check",
        "lint",
        "test:component",
        "test:coverage",
        "test:e2e",
        "test:integration",
        "test:unit",
        "texpulse-compile",
        "texpulse-doctor",
        "typecheck",
      ]),
    );
  });

  it("keeps strict type checking enabled", async () => {
    const config = await readJson<TypeScriptConfig>("tsconfig.json");

    expect(config.compilerOptions?.strict).toBe(true);
    expect(config.compilerOptions?.noEmit).toBe(true);
  });

  it("keeps the CI quality gate valid YAML and on Windows", async () => {
    const source = await readFile(".github/workflows/ci.yml", "utf8");
    const workflow = parse(source) as Workflow;
    const runCommands =
      workflow.jobs?.quality?.steps
        ?.map((step) => step.run)
        .filter((command): command is string => command !== undefined) ?? [];

    expect(workflow.name).toBe("Quality Gate");
    expect(workflow.jobs?.quality?.["runs-on"]).toBe("windows-latest");
    expect(runCommands).toEqual(
      expect.arrayContaining([
        "corepack enable",
        "pnpm --version",
        "pnpm install --frozen-lockfile",
        "pnpm check",
      ]),
    );
  });
});
