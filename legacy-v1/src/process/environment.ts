import { delimiter, resolve } from "node:path";

export function environmentWithPrependedPath(
  directory: string,
  environment?: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv;
export function environmentWithPrependedPath(
  directory: undefined,
  environment?: NodeJS.ProcessEnv,
): undefined;
export function environmentWithPrependedPath(
  directory: string | undefined,
  environment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv | undefined {
  if (directory === undefined) {
    return undefined;
  }

  const pathKey =
    Object.keys(environment).find((key) => key.toLowerCase() === "path") ??
    "PATH";
  const currentPath = environment[pathKey] ?? "";
  return {
    ...environment,
    [pathKey]:
      currentPath === ""
        ? resolve(directory)
        : `${resolve(directory)}${delimiter}${currentPath}`,
  };
}
