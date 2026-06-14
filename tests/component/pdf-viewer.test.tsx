// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const pdfMocks = vi.hoisted(() => ({
  destroy: vi.fn(() => Promise.resolve()),
  getDocument: vi.fn(),
  renderCancel: vi.fn(),
}));

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: pdfMocks.getDocument,
}));

vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({
  default: "pdf.worker.mjs",
}));

import { PdfViewer } from "../../src/renderer/components/PdfViewer.js";

beforeAll(() => {
  class TestResizeObserver {
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
});

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    {} as CanvasRenderingContext2D,
  );
});

function artifact(generation: number) {
  return {
    buildId: `build-${String(generation)}`,
    generation,
    fileName: "main.pdf",
    isCurrent: true,
    completedAt: "2026-06-13T12:00:00.000Z",
  };
}

describe("PdfViewer", () => {
  it("preserves page, zoom, and approximate scroll across PDF reloads", async () => {
    pdfMocks.getDocument.mockImplementation(() => ({
      destroy: pdfMocks.destroy,
      promise: Promise.resolve({
        numPages: 3,
        getPage: () =>
          Promise.resolve({
            getViewport: ({ scale }: { scale: number }) => ({
              height: 800 * scale,
              width: 600 * scale,
            }),
            render: () => ({
              cancel: pdfMocks.renderCancel,
              promise: Promise.resolve(),
            }),
          }),
      }),
    }));
    const user = userEvent.setup();
    const { container, rerender } = render(
      <PdfViewer
        artifact={artifact(1)}
        data={new Uint8Array([1])}
        defaultZoomMode="fit-width"
        syncTarget={null}
        onOpen={vi.fn()}
        onReveal={vi.fn()}
        onInverseSearch={vi.fn()}
      />,
    );

    await screen.findByText("Page 1 of 3");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Page 2 of 3");
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByText("125%")).toBeInTheDocument();

    const viewport = container.querySelector(".pdf-viewport");
    expect(viewport).not.toBeNull();
    if (viewport === null) {
      return;
    }
    viewport.scrollTop = 54;
    viewport.scrollLeft = 12;
    fireEvent.scroll(viewport);

    rerender(
      <PdfViewer
        artifact={artifact(2)}
        data={new Uint8Array([2])}
        defaultZoomMode="fit-width"
        syncTarget={null}
        onOpen={vi.fn()}
        onReveal={vi.fn()}
        onInverseSearch={vi.fn()}
      />,
    );

    await screen.findByText("Page 2 of 3");
    expect(screen.getByText("125%")).toBeInTheDocument();
    await waitFor(() => {
      expect(viewport.scrollTop).toBe(54);
      expect(viewport.scrollLeft).toBe(12);
    });
    expect(pdfMocks.destroy).toHaveBeenCalled();
  });

  it("shows a forward target and reports inverse-search page coordinates", async () => {
    pdfMocks.getDocument.mockImplementation(() => ({
      destroy: pdfMocks.destroy,
      promise: Promise.resolve({
        numPages: 1,
        getPage: () =>
          Promise.resolve({
            getViewport: ({ scale }: { scale: number }) => ({
              height: 800 * scale,
              width: 600 * scale,
            }),
            render: () => ({
              cancel: pdfMocks.renderCancel,
              promise: Promise.resolve(),
            }),
          }),
      }),
    }));
    const onInverseSearch = vi.fn();
    render(
      <PdfViewer
        artifact={artifact(1)}
        data={new Uint8Array([1])}
        defaultZoomMode="fit-width"
        syncTarget={{
          page: 1,
          x: 72,
          y: 108,
          width: 180,
          height: 16,
          requestId: 1,
        }}
        onOpen={vi.fn()}
        onReveal={vi.fn()}
        onInverseSearch={onInverseSearch}
      />,
    );

    const canvas = await screen.findByLabelText("PDF page 1");
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      bottom: 820,
      height: 800,
      left: 10,
      right: 610,
      top: 20,
      width: 600,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    });
    expect(
      screen.getByLabelText("Forward search target on page 1"),
    ).toBeVisible();

    fireEvent.doubleClick(canvas, { clientX: 25, clientY: 45 });
    expect(onInverseSearch).toHaveBeenCalledWith(1, 15, 25);
  });

  it("does not request a PDF page beyond the loaded document", async () => {
    const getPage = vi.fn(() =>
      Promise.resolve({
        getViewport: ({ scale }: { scale: number }) => ({
          height: 800 * scale,
          width: 600 * scale,
        }),
        render: () => ({
          cancel: pdfMocks.renderCancel,
          promise: Promise.resolve(),
        }),
      }),
    );
    pdfMocks.getDocument.mockImplementation(() => ({
      destroy: pdfMocks.destroy,
      promise: Promise.resolve({ numPages: 1, getPage }),
    }));

    render(
      <PdfViewer
        artifact={artifact(1)}
        data={new Uint8Array([1])}
        defaultZoomMode="fit-width"
        syncTarget={{
          page: 99,
          x: 1,
          y: 1,
          width: 1,
          height: 1,
          requestId: 1,
        }}
        onOpen={vi.fn()}
        onReveal={vi.fn()}
        onInverseSearch={vi.fn()}
      />,
    );

    await screen.findByText("Page 1 of 1");
    await waitFor(() => {
      expect(getPage).toHaveBeenCalled();
    });
    expect(getPage).not.toHaveBeenCalledWith(99);
  });
});
