import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type RenderTask,
} from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  useCallback,
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
  const viewportRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
  const scrollPositionRef = useRef({ left: 0, top: 0 });
  const renderedPagesRef = useRef(new Set<number>());
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoomMode, setZoomMode] = useState<ZoomMode>(defaultZoomMode);
  const [customScale, setCustomScale] = useState(1);
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) {
      return;
    }
    const updateSize = () => {
      setViewportSize({
        width: Math.max(viewport.clientWidth - 36, 1),
        height: Math.max(viewport.clientHeight - 36, 1),
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
    setLoading(true);
    setError(null);
    renderedPagesRef.current.clear();
    pageRefs.current.clear();
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
        setLoading(false);
      })
      .catch((loadError: unknown) => {
        if (!disposed) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "PDF.js could not load the completed PDF.",
          );
          setLoading(false);
        }
      });
    return () => {
      disposed = true;
      void loadingTask.destroy();
    };
  }, [artifact.buildId, artifact.generation, data]);

  useEffect(() => {
    renderedPagesRef.current.clear();
  }, [customScale, pdf, viewportSize.height, viewportSize.width, zoomMode]);

  useEffect(() => {
    if (syncTarget === null || pdf === null) {
      return;
    }
    const targetPage = Math.min(Math.max(syncTarget.page, 1), pdf.numPages);
    setPageNumber(targetPage);
  }, [pdf, syncTarget]);

  const pageNumbers = useMemo(
    () =>
      pdf === null
        ? []
        : Array.from({ length: pdf.numPages }, (_, index) => index + 1),
    [pdf],
  );

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

  const scrollToPage = (requestedPage: number) => {
    if (pdf === null) {
      return;
    }
    const targetPage = Math.min(Math.max(requestedPage, 1), pdf.numPages);
    setPageNumber(targetPage);
    const target = pageRefs.current.get(targetPage);
    if (target !== undefined && typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ block: "start", inline: "center" });
    }
  };

  const pageRendered = useCallback(
    (renderedPage: number) => {
      renderedPagesRef.current.add(renderedPage);
      if (
        pdf !== null &&
        renderedPagesRef.current.size === pdf.numPages &&
        viewportRef.current !== null
      ) {
        viewportRef.current.scrollLeft = scrollPositionRef.current.left;
        viewportRef.current.scrollTop = scrollPositionRef.current.top;
      }
    },
    [pdf],
  );

  const updateCurrentPageFromScroll = () => {
    const viewport = viewportRef.current;
    if (viewport === null || pageRefs.current.size === 0) {
      return;
    }
    const viewportBounds = viewport.getBoundingClientRect();
    if (viewportBounds.width === 0 && viewportBounds.height === 0) {
      return;
    }
    let closestPage = pageNumber;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const [candidatePage, element] of pageRefs.current) {
      const bounds = element.getBoundingClientRect();
      const distance = Math.abs(bounds.top - viewportBounds.top - 12);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestPage = candidatePage;
      }
    }
    setPageNumber(closestPage);
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
            scrollToPage(pageNumber - 1);
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
            scrollToPage(pageNumber + 1);
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
        <span className="sync-hint">
          Scroll pages; double-click for SyncTeX
        </span>
      </div>
      <div
        className="pdf-viewport"
        ref={viewportRef}
        onScroll={(event) => {
          scrollPositionRef.current = {
            left: event.currentTarget.scrollLeft,
            top: event.currentTarget.scrollTop,
          };
          updateCurrentPageFromScroll();
        }}
      >
        {error === null ? (
          <div className="pdf-pages">
            {pdf === null
              ? null
              : pageNumbers.map((number) => (
                  <PdfPageCanvas
                    key={number}
                    pdf={pdf}
                    pageNumber={number}
                    zoomMode={zoomMode}
                    customScale={customScale}
                    viewportSize={viewportSize}
                    syncTarget={syncTarget?.page === number ? syncTarget : null}
                    pageRef={(element) => {
                      if (element === null) {
                        pageRefs.current.delete(number);
                      } else {
                        pageRefs.current.set(number, element);
                      }
                    }}
                    onError={setError}
                    onInverseSearch={onInverseSearch}
                    onRendered={pageRendered}
                  />
                ))}
          </div>
        ) : (
          <div className="preview-message" role="alert">
            <strong>PDF preview failed</strong>
            <span>{error}</span>
          </div>
        )}
        {loading && error === null ? (
          <div className="pdf-loading" role="status">
            Loading PDF...
          </div>
        ) : null}
      </div>
    </section>
  );
}

interface PdfPageCanvasProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  zoomMode: ZoomMode;
  customScale: number;
  viewportSize: { width: number; height: number };
  syncTarget: PdfSyncTarget | null;
  pageRef: (element: HTMLDivElement | null) => void;
  onError: (message: string) => void;
  onInverseSearch: (page: number, x: number, y: number) => void;
  onRendered: (page: number) => void;
}

function PdfPageCanvas({
  pdf,
  pageNumber,
  zoomMode,
  customScale,
  viewportSize,
  syncTarget,
  pageRef,
  onError,
  onInverseSearch,
  onRendered,
}: PdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  const [renderedScale, setRenderedScale] = useState(1);
  const [pageSize, setPageSize] = useState({ width: 600, height: 800 });
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }
    let cancelled = false;
    let renderTask: RenderTask | null = null;
    setRendering(true);

    void pdf
      .getPage(pageNumber)
      .then((page: PDFPageProxy) => {
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
        const boundedScale = Math.max(scale, 0.1);
        const viewport = page.getViewport({ scale: boundedScale });
        setRenderedScale(boundedScale);
        setPageSize({ width: viewport.width, height: viewport.height });
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
          setRendering(false);
          onRendered(pageNumber);
        }
      })
      .catch((renderError: unknown) => {
        if (!cancelled && renderError instanceof Error) {
          onError(renderError.message);
        }
      });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [
    customScale,
    onError,
    onRendered,
    pageNumber,
    pdf,
    viewportSize.height,
    viewportSize.width,
    zoomMode,
  ]);

  useEffect(() => {
    const target = targetRef.current;
    if (
      syncTarget !== null &&
      !rendering &&
      target !== null &&
      typeof target.scrollIntoView === "function"
    ) {
      target.scrollIntoView({ block: "center", inline: "center" });
    }
  }, [rendering, renderedScale, syncTarget]);

  const handleInverseSearch = (event: MouseEvent<HTMLCanvasElement>): void => {
    const bounds = event.currentTarget.getBoundingClientRect();
    onInverseSearch(
      pageNumber,
      Math.max((event.clientX - bounds.left) / renderedScale, 0),
      Math.max((event.clientY - bounds.top) / renderedScale, 0),
    );
  };

  return (
    <div
      ref={pageRef}
      className="pdf-page"
      data-page-number={pageNumber}
      style={
        {
          "--pdf-page-width": `${String(pageSize.width)}px`,
          "--pdf-page-height": `${String(pageSize.height)}px`,
        } as CSSProperties
      }
    >
      <canvas
        ref={canvasRef}
        aria-label={`PDF page ${String(pageNumber)}`}
        onDoubleClick={handleInverseSearch}
      />
      {syncTarget === null ? null : (
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
      )}
      {rendering ? (
        <span className="pdf-page-loading">Rendering...</span>
      ) : null}
    </div>
  );
}
