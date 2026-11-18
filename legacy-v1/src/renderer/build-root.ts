export function selectBuildRoot(
  activePath: string | null,
  configuredRoot: string | null | undefined,
  rootCandidates: readonly string[] = [],
): string | null {
  if (
    activePath?.toLowerCase().endsWith(".tex") === true &&
    rootCandidates.includes(activePath)
  ) {
    return activePath;
  }
  return configuredRoot ?? null;
}
