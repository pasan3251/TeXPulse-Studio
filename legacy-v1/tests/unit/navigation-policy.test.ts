import { describe, expect, it } from "vitest";

import {
  isAllowedRendererNavigation,
  isExternalUrl,
} from "../../src/electron/navigation-policy.js";

describe("renderer navigation policy", () => {
  it("allows only the exact loaded local document", () => {
    const current = "file:///C:/app/renderer/index.html";
    expect(isAllowedRendererNavigation(current, current)).toBe(true);
    expect(isAllowedRendererNavigation(current, "https://example.com/")).toBe(
      false,
    );
    expect(isAllowedRendererNavigation(current, "javascript:alert(1)")).toBe(
      false,
    );
    expect(
      isAllowedRendererNavigation(current, "file:///C:/Windows/win.ini"),
    ).toBe(false);
  });

  it("classifies malformed and non-file targets as external", () => {
    expect(isExternalUrl("https://example.com")).toBe(true);
    expect(isExternalUrl("not a url")).toBe(true);
    expect(isExternalUrl("file:///C:/app/index.html")).toBe(false);
  });
});
