// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

describe("ProjectExplorer", () => {
  it("renders hierarchy, active file, modified marker, and inert links", async () => {
    const user = userEvent.setup();
    const onOpenFile = vi.fn();
    render(
      <ProjectExplorer
        project={project}
        activePath="main.tex"
        selectedPath="main.tex"
        modifiedPaths={new Set(["chapters/intro.tex"])}
        loadingPath={null}
        onCreateFile={vi.fn()}
        onCreateFolder={vi.fn()}
        onDelete={vi.fn()}
        onExport={vi.fn()}
        onOpenFile={onOpenFile}
        onRename={vi.fn()}
        onSelectEntry={vi.fn()}
      />,
    );

    const intro = screen.getByRole("button", { name: /intro\.tex/i });
    expect(within(intro).getByLabelText("Modified")).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { selected: true })).toHaveTextContent(
      "main.tex",
    );
    expect(screen.getByText("linked").closest(".tree-row")).toHaveClass("link");

    await user.click(intro);
    expect(onOpenFile).toHaveBeenCalledWith("chapters/intro.tex");
  });

  it("exposes named project actions and selectable folders", async () => {
    const user = userEvent.setup();
    const onCreateFile = vi.fn();
    const onSelectEntry = vi.fn();
    render(
      <ProjectExplorer
        project={project}
        activePath={null}
        selectedPath={null}
        modifiedPaths={new Set()}
        loadingPath={null}
        onCreateFile={onCreateFile}
        onCreateFolder={vi.fn()}
        onDelete={vi.fn()}
        onExport={vi.fn()}
        onOpenFile={vi.fn()}
        onRename={vi.fn()}
        onSelectEntry={onSelectEntry}
      />,
    );

    await user.click(screen.getByRole("button", { name: "New file" }));
    await user.click(screen.getByRole("button", { name: "chapters" }));
    expect(onCreateFile).toHaveBeenCalledOnce();
    expect(onSelectEntry).toHaveBeenCalledWith("chapters");
  });
});
