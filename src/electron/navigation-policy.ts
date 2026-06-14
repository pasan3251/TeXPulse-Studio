export function isAllowedRendererNavigation(
  currentUrl: string,
  targetUrl: string,
): boolean {
  try {
    const current = new URL(currentUrl);
    const target = new URL(targetUrl);
    return (
      current.protocol === "file:" &&
      target.protocol === "file:" &&
      target.href === current.href
    );
  } catch {
    return false;
  }
}

export function isExternalUrl(targetUrl: string): boolean {
  try {
    return new URL(targetUrl).protocol !== "file:";
  } catch {
    return true;
  }
}
