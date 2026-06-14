// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProjectExplorer } from "../../src/renderer/components/ProjectExplorer.js";

const modifiedAt = "2026-06-13T12:00:00.000Z";
const project = {
  name: "paper",
  entries: [
    { path: "chapters", kind: "directory" as const, size: 0, modifiedAt },
    {
      path: "chapters/intro.tex",
      kind: "file" as const,
      size: 10,
      modifiedAt,
    },
    { path: "main.tex", kind: "file" as const, size: 20, modifiedAt },
    { path: "linked", kind: "link" as const, size: 0, modifiedAt },
  ],
  rootCandidates: [],
  projectId: "a".repeat(16),
  rootFile: "main.tex",
  autoBuild: true,
  settings: {
    rootFile: "main.tex",
    recipe: "latexmk-pdf" as const,
    buildDirectory: ".texpulse/build",
    autoBuild: true,
    allowLatexmkRc: false,
  },
  settingsIssues: [],
};

afterEach(cleanup);

function renderExplorer(
  overrides: Partial<ComponentProps<typeof ProjectExplorer>> = {},
) {
  const props: ComponentProps<typeof ProjectExplorer> = {
    project,
    activePath: "main.tex",
    selectedPath: "main.tex",
    modifiedPaths: new Set(["chapters/intro.tex"]),
    loadingPath: null,
    clipboard: null,
    onCopy: vi.fn(),
    onCreateFile: vi.fn(),
    onCreateFolder: vi.fn(),
    onCut: vi.fn(),
    onDelete: vi.fn(),
    onExport: vi.fn(),
    onOpenFile: vi.fn(),
    onPaste: vi.fn(),
    onRename: vi.fn(),
    onReveal: vi.fn(),
    onSelectEntry: vi.fn(),
    ...overrides,
  };
  return { ...render(<ProjectExplorer {...props} />), props };
}

describe("ProjectExplorer", () => {
  it("renders hierarchy, material-style icons, modified state, and collapse controls", async () => {
    const user = userEvent.setup();
    const { props } = renderExplorer();

    const intro = screen.getByRole("button", { name: /intro\.tex/i });
    expect(within(intro).getByLabelText("Modified")).toBeInTheDocument();
    expect(intro.querySelector(".file-icon-tex")).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { selected: true })).toHaveTextContent(
      "main.tex",
    );
    expect(screen.getByText("linked").closest(".tree-row")).toHaveClass("link");

    await user.click(intro);
    expect(props.onOpenFile).toHaveBeenCalledWith("chapters/intro.tex");
    await user.click(screen.getByRole("button", { name: "chapters" }));
    expect(screen.queryByRole("button", { name: /intro\.tex/i })).toBeNull();
  });

  it("keeps only new file and folder in the heading", async () => {
    const user = userEvent.setup();
    const onCreateFile = vi.fn();
    const onCreateFolder = vi.fn();
    renderExplorer({
      activePath: null,
      selectedPath: null,
      modifiedPaths: new Set(),
      onCreateFile,
      onCreateFolder,
    });

    await user.click(screen.getByRole("button", { name: "New file" }));
    await user.click(screen.getByRole("button", { name: "New folder" }));
    expect(onCreateFile).toHaveBeenCalledWith("");
    expect(onCreateFolder).toHaveBeenCalledWith("");
    expect(screen.queryByRole("button", { name: "Rename" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("opens entry actions on right-click", async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    const onDelete = vi.fn();
    const onReveal = vi.fn();
    renderExplorer({ onCopy, onDelete, onReveal });

    fireEvent.contextMenu(screen.getByRole("button", { name: /main\.tex/i }), {
      clientX: 40,
      clientY: 50,
    });
    const menu = screen.getByRole("menu", { name: "Project entry actions" });
    expect(within(menu).getByRole("menuitem", { name: "Open" })).toBeVisible();
    expect(
      within(menu).getByRole("menuitem", { name: "Reveal in File Explorer" }),
    ).toBeVisible();

    await user.click(within(menu).getByRole("menuitem", { name: "Copy" }));
    expect(onCopy).toHaveBeenCalledWith("main.tex");

    fireEvent.contextMenu(screen.getByRole("button", { name: /main\.tex/i }));
    await user.click(
      screen.getByRole("menuitem", { name: "Reveal in File Explorer" }),
    );
    expect(onReveal).toHaveBeenCalledWith("main.tex");

    fireEvent.contextMenu(screen.getByRole("button", { name: /main\.tex/i }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith("main.tex");
  });

  it("offers paste on directories when an entry is copied", async () => {
    const user = userEvent.setup();
    const onPaste = vi.fn();
    renderExplorer({
      clipboard: { operation: "copy", sourcePath: "main.tex" },
      onPaste,
    });

    fireEvent.contextMenu(screen.getByRole("button", { name: "chapters" }));
    await user.click(screen.getByRole("menuitem", { name: "Paste" }));
    expect(onPaste).toHaveBeenCalledWith("chapters");
  });
});
