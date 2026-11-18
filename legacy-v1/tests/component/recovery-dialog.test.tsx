// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RecoveryDialog } from "../../src/renderer/components/RecoveryDialog.js";

describe("RecoveryDialog", () => {
  it("requires an explicit restore or discard decision", async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn();
    const onDiscard = vi.fn();
    render(
      <RecoveryDialog
        busy={false}
        snapshot={{
          schemaVersion: 1,
          projectId: "a".repeat(16),
          savedAt: "2026-06-14T00:00:00.000Z",
          buffers: [
            {
              path: "main.tex",
              content: "Unsaved local content",
              version: "b".repeat(64),
            },
          ],
        }}
        onDiscard={onDiscard}
        onRestore={onRestore}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "Review unsaved editor content" }),
    ).toBeVisible();
    expect(screen.getByText("Unsaved local content")).toBeVisible();
    expect(screen.getByText(/does not write project files/i)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Restore to editor" }));
    expect(onRestore).toHaveBeenCalledOnce();
    expect(onDiscard).not.toHaveBeenCalled();
  });
});
