// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

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
};

describe("ProjectExplorer", () => {
  it("renders hierarchy, active file, modified marker, and inert links", async () => {
    const user = userEvent.setup();
    const onOpenFile = vi.fn();
    render(
      <ProjectExplorer
        project={project}
        activePath="main.tex"
        modifiedPaths={new Set(["chapters/intro.tex"])}
        loadingPath={null}
        onOpenFile={onOpenFile}
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
});
