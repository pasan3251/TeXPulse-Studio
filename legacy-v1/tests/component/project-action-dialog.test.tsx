// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProjectActionDialog } from "../../src/renderer/components/ProjectActionDialog.js";

afterEach(cleanup);

describe("ProjectActionDialog", () => {
  it("requires explicit confirmation before permanent deletion", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ProjectActionDialog
        action="delete"
        busy={false}
        initialPath="chapters"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "Delete project entry" }),
    ).toHaveTextContent("cannot be undone");
    const confirm = screen.getByRole("button", {
      name: "Delete permanently",
    });
    expect(confirm).toHaveFocus();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith("chapters");
  });

  it("submits a trimmed project-relative path from the keyboard", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ProjectActionDialog
        action="create-file"
        busy={false}
        initialPath="new-file.tex"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    const input = screen.getByRole("textbox", {
      name: "Project-relative path",
    });
    await user.clear(input);
    await user.type(input, " chapters/new.tex {Enter}");
    expect(onConfirm).toHaveBeenCalledWith("chapters/new.tex");
  });

  it("cancels from the keyboard", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <ProjectActionDialog
        action="rename"
        busy={false}
        initialPath="main.tex"
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />,
    );

    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("keeps keyboard focus inside the modal", async () => {
    const user = userEvent.setup();
    render(
      <ProjectActionDialog
        action="delete"
        busy={false}
        initialPath="main.tex"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const confirm = screen.getByRole("button", {
      name: "Delete permanently",
    });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();
  });
});
