// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ProblemsPanel } from "../../src/renderer/components/ProblemsPanel.js";

const error = {
  severity: "error" as const,
  message: "Undefined control sequence.",
  file: "chapters/intro.tex",
  line: 2,
  column: 1,
  source: "latex" as const,
  rawExcerpt: "<script>alert('not markup')</script>",
};

describe("ProblemsPanel", () => {
  it("labels severities, escapes excerpts, and navigates located problems", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ProblemsPanel
        diagnostics={[
          error,
          {
            severity: "warning",
            message: "Reference is undefined.",
            file: null,
            line: null,
            column: null,
            source: "latex",
            rawExcerpt: "warning",
          },
          {
            severity: "info",
            message: "Compilation was cancelled.",
            file: null,
            line: null,
            column: null,
            source: "system",
            rawExcerpt: "",
          },
        ]}
        onClose={vi.fn()}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByText("1 errors · 1 warnings · 1 info")).toBeVisible();
    expect(screen.getByText("Error")).toBeVisible();
    expect(screen.getByText("Warning")).toBeVisible();
    expect(screen.getByText("Info")).toBeVisible();
    expect(
      screen.getByText("<script>alert('not markup')</script>"),
    ).toBeVisible();
    expect(document.querySelector("script")).toBeNull();

    await user.click(
      screen.getByRole("button", {
        name: /Error: Undefined control sequence.*chapters\/intro\.tex:2:1/iu,
      }),
    );
    expect(onSelect).toHaveBeenCalledWith(error);
    expect(
      screen.getByRole("button", {
        name: /Warning: Reference is undefined/iu,
      }),
    ).toBeDisabled();
  });

  it("shows a useful empty state", () => {
    render(
      <ProblemsPanel diagnostics={[]} onClose={vi.fn()} onSelect={vi.fn()} />,
    );
    expect(
      screen.getByText("The current build has no diagnostics."),
    ).toBeVisible();
  });
});
