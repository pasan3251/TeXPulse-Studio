// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { EditorPane } from "../../src/renderer/components/EditorPane.js";

beforeAll(() => {
  Range.prototype.getClientRects = vi.fn(() => [] as unknown as DOMRectList);
  Range.prototype.getBoundingClientRect = vi.fn(
    () =>
      ({
        bottom: 0,
        height: 0,
        left: 0,
        right: 0,
        top: 0,
        width: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect,
  );
});

const buffer = {
  path: "main.tex",
  content: "line one\nline two\nline three",
  savedContent: "line one\nline two\nline three",
  version: "a".repeat(64),
  cursor: 0,
  scrollTop: 0,
};

describe("EditorPane diagnostics", () => {
  it("marks a diagnostic line and moves focus to the requested location", async () => {
    const diagnostic = {
      severity: "error" as const,
      message: "Undefined control sequence.",
      file: "main.tex",
      line: 2,
      column: 2,
      source: "latex" as const,
      rawExcerpt: "l.2",
    };
    const { container, rerender } = render(
      <EditorPane
        buffer={buffer}
        diagnostics={[diagnostic]}
        fontSize={15}
        navigationTarget={null}
        onChange={vi.fn()}
        onViewStateChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector(".cm-diagnostic-error")).not.toBeNull();
    });
    expect(container.querySelector(".cm-diagnostic-error")).toHaveAttribute(
      "title",
      "Undefined control sequence.",
    );

    rerender(
      <EditorPane
        buffer={buffer}
        diagnostics={[diagnostic]}
        fontSize={15}
        navigationTarget={{
          path: "main.tex",
          line: 2,
          column: 2,
          requestId: 1,
          kind: "diagnostic",
        }}
        onChange={vi.fn()}
        onViewStateChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Editor for main.tex")).toHaveFocus();
      expect(container.querySelector(".cm-activeLine")).toHaveTextContent(
        "line two",
      );
    });
  });

  it("marks an inverse-search source line", async () => {
    const { container } = render(
      <EditorPane
        buffer={buffer}
        diagnostics={[]}
        fontSize={15}
        navigationTarget={{
          path: "main.tex",
          line: 3,
          column: null,
          requestId: 2,
          kind: "synctex",
        }}
        onChange={vi.fn()}
        onViewStateChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector(".cm-synctex-target")).toHaveTextContent(
        "line three",
      );
    });
  });
});
