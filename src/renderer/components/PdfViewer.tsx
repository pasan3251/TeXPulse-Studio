import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useMemo, useRef, useState } from "react";

import type { PdfArtifact } from "../../ipc/build-contracts.js";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type ZoomMode = "custom" | "fit-page" | "fit-width";

interface PdfViewerProps {
  artifact: PdfArtifact;
  data: Uint8Array;
  onOpen: () => void;
  onReveal: () => void;
}

export function PdfViewer({
  artifact,
  data,
  onOpen,
  onReveal,
}: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef({ left: 0, top: 0 });
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoomMode, setZoomMode] = useState<ZoomMode>("fit-width");
  const [customScale, setCustomScale] = useState(1);
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
          <canvas
            ref={canvasRef}
            aria-label={`PDF page ${String(pageNumber)}`}
          />
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
