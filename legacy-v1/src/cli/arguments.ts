export class CliUsageError extends Error {}

export interface ParsedArguments {
  values: Map<string, string>;
  flags: Set<string>;
}

export function parseArguments(
  args: readonly string[],
  valueOptions: ReadonlySet<string>,
  flagOptions: ReadonlySet<string>,
): ParsedArguments {
  const values = new Map<string, string>();
  const flags = new Set<string>();

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) {
      continue;
    }

    if (flagOptions.has(argument)) {
      flags.add(argument);
      continue;
    }

    if (valueOptions.has(argument)) {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new CliUsageError(`${argument} requires a value.`);
      }
      values.set(argument, value);
      index += 1;
      continue;
    }

    throw new CliUsageError(`Unknown argument: ${argument}`);
  }

  return { values, flags };
}
