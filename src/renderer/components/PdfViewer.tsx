import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";

import type { PdfArtifact } from "../../ipc/build-contracts.js";
import type { PdfSyncTarget } from "../workspace-state.js";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type ZoomMode = "custom" | "fit-page" | "fit-width";

interface PdfViewerProps {
  artifact: PdfArtifact;
  data: Uint8Array;
  defaultZoomMode: Exclude<ZoomMode, "custom">;
  syncTarget: PdfSyncTarget | null;
  onOpen: () => void;
  onReveal: () => void;
  onInverseSearch: (page: number, x: number, y: number) => void;
}

export function PdfViewer({
  artifact,
  data,
  defaultZoomMode,
  syncTarget,
  onOpen,
  onReveal,
  onInverseSearch,
}: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef({ left: 0, top: 0 });
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoomMode, setZoomMode] = useState<ZoomMode>(defaultZoomMode);
  const [customScale, setCustomScale] = useState(1);
  const [renderedScale, setRenderedScale] = useState(1);
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 });
  const [renderState, setRenderState] = useState<
    "loading" | "ready" | "rendering"
  >("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) {
      return;
    }
    const updateSize = () => {
      setViewportSize({
        width: Math.max(viewport.clientWidth - 32, 1),
        height: Math.max(viewport.clientHeight - 32, 1),
      });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(viewport);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    setPdf(null);
    setRenderState("loading");
    setError(null);
    const loadingTask = getDocument({
      data: data.slice(),
      enableXfa: false,
      maxImageSize: 25_000_000,
      stopAtErrors: true,
    });
    void loadingTask.promise
      .then((document) => {
        if (disposed) {
          return;
        }
        setPdf(document);
        setPageNumber((current) =>
          Math.min(Math.max(current, 1), document.numPages),
        );
        setRenderState("ready");
      })
      .catch((loadError: unknown) => {
        if (!disposed) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "PDF.js could not load the completed PDF.",
          );
          setRenderState("ready");
        }
      });
    return () => {
      disposed = true;
      void loadingTask.destroy();
    };
  }, [artifact.buildId, artifact.generation, data]);

  useEffect(() => {
    if (syncTarget !== null && pdf !== null) {
      setPageNumber(Math.min(syncTarget.page, pdf.numPages));
    }
  }, [pdf, syncTarget]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const scrollViewport = viewportRef.current;
    if (pdf === null || canvas === null || scrollViewport === null) {
      return;
    }
    let cancelled = false;
    let renderTask: ReturnType<
      Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]
    > | null = null;
    setRenderState("rendering");
    setError(null);

    void pdf
      .getPage(pageNumber)
      .then((page) => {
        if (cancelled) {
          return;
        }
        const natural = page.getViewport({ scale: 1 });
        const scale =
          zoomMode === "custom"
            ? customScale
            : zoomMode === "fit-page"
              ? Math.min(
                  viewportSize.width / natural.width,
                  viewportSize.height / natural.height,
                )
              : viewportSize.width / natural.width;
        const viewport = page.getViewport({ scale: Math.max(scale, 0.1) });
        setRenderedScale(Math.max(scale, 0.1));
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const context = canvas.getContext("2d");
        if (context === null) {
          throw new Error("PDF canvas is unavailable.");
        }
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${String(Math.floor(viewport.width))}px`;
        canvas.style.height = `${String(Math.floor(viewport.height))}px`;
        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform:
            outputScale === 1
              ? undefined
              : [outputScale, 0, 0, outputScale, 0, 0],
        });
        return renderTask.promise;
      })
      .then(() => {
        if (!cancelled) {
          scrollViewport.scrollLeft = scrollPositionRef.current.left;
          scrollViewport.scrollTop = scrollPositionRef.current.top;
          setRenderState("ready");
        }
      })
      .catch((renderError: unknown) => {
        if (!cancelled && renderError instanceof Error) {
          setError(renderError.message);
          setRenderState("ready");
        }
      });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [
    customScale,
    pageNumber,
    pdf,
    viewportSize.height,
    viewportSize.width,
    zoomMode,
  ]);

  const zoomLabel = useMemo(() => {
    if (zoomMode === "fit-page") {
      return "Fit page";
    }
    if (zoomMode === "fit-width") {
      return "Fit width";
    }
    return `${String(Math.round(customScale * 100))}%`;
  }, [customScale, zoomMode]);

  const adjustZoom = (factor: number) => {
    setCustomScale((current) => Math.min(Math.max(current * factor, 0.25), 4));
    setZoomMode("custom");
  };

  useEffect(() => {
    const target = targetRef.current;
    if (
      syncTarget?.page === pageNumber &&
      renderState === "ready" &&
      target !== null &&
      typeof target.scrollIntoView === "function"
    ) {
      target.scrollIntoView({ block: "center", inline: "center" });
    }
  }, [pageNumber, renderState, renderedScale, syncTarget]);

  const handleInverseSearch = (event: MouseEvent<HTMLCanvasElement>): void => {
    const bounds = event.currentTarget.getBoundingClientRect();
    onInverseSearch(
      pageNumber,
      Math.max((event.clientX - bounds.left) / renderedScale, 0),
      Math.max((event.clientY - bounds.top) / renderedScale, 0),
    );
  };

  return (
    <section className="pdf-panel" aria-label="PDF preview">
      <header className="pdf-header">
        <div>
          <p className="eyebrow">PDF Preview</p>
          <strong>{artifact.fileName}</strong>
          <span
            className={`build-badge ${artifact.isCurrent ? "current" : "retained"}`}
          >
            {artifact.isCurrent ? "Current build" : "Last successful build"}
          </span>
        </div>
        <div className="pdf-actions">
          <button type="button" className="icon-button" onClick={onOpen}>
            Open PDF
          </button>
          <button type="button" className="icon-button" onClick={onReveal}>
            Reveal
          </button>
        </div>
      </header>
      <div className="pdf-toolbar" aria-label="PDF controls">
        <button
          type="button"
          className="icon-button"
          disabled={pageNumber <= 1}
          onClick={() => {
            setPageNumber((current) => Math.max(current - 1, 1));
          }}
        >
          Previous
        </button>
        <span>
          Page {String(pageNumber)} of {String(pdf?.numPages ?? 0)}
        </span>
        <button
          type="button"
          className="icon-button"
          disabled={pdf === null || pageNumber >= pdf.numPages}
          onClick={() => {
            setPageNumber((current) =>
              Math.min(current + 1, pdf?.numPages ?? current),
            );
          }}
        >
          Next
        </button>
        <span className="toolbar-spacer" />
        <button
          type="button"
          className="icon-button"
          aria-label="Zoom out"
          onClick={() => {
            adjustZoom(0.8);
          }}
        >
          -
        </button>
        <span>{zoomLabel}</span>
        <button
          type="button"
          className="icon-button"
          aria-label="Zoom in"
          onClick={() => {
            adjustZoom(1.25);
          }}
        >
          +
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={() => {
            setZoomMode("fit-width");
          }}
        >
          Fit width
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={() => {
            setZoomMode("fit-page");
          }}
        >
          Fit page
        </button>
        <span className="sync-hint">Double-click page for inverse search</span>
      </div>
      <div
        className="pdf-viewport"
        ref={viewportRef}
        onScroll={(event) => {
          scrollPositionRef.current = {
            left: event.currentTarget.scrollLeft,
            top: event.currentTarget.scrollTop,
          };
        }}
      >
        {error === null ? (
          <div className="pdf-page">
            <canvas
              ref={canvasRef}
              aria-label={`PDF page ${String(pageNumber)}`}
              onDoubleClick={handleInverseSearch}
            />
            {syncTarget?.page === pageNumber ? (
              <div
                ref={targetRef}
                className="pdf-sync-target"
                aria-label={`Forward search target on page ${String(pageNumber)}`}
                style={
                  {
                    left: `${String(syncTarget.x * renderedScale)}px`,
                    top: `${String(syncTarget.y * renderedScale)}px`,
                    width: `${String(
                      Math.max(syncTarget.width * renderedScale, 12),
                    )}px`,
                    height: `${String(
                      Math.max(syncTarget.height * renderedScale, 12),
                    )}px`,
                  } as CSSProperties
                }
              />
            ) : null}
          </div>
        ) : (
          <div className="preview-message" role="alert">
            <strong>PDF preview failed</strong>
            <span>{error}</span>
          </div>
        )}
        {renderState !== "ready" && error === null ? (
          <div className="pdf-loading" role="status">
            {renderState === "loading" ? "Loading PDF..." : "Rendering page..."}
          </div>
        ) : null}
      </div>
    </section>
  );
}
