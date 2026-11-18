import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type PageViewport,
  type RenderTask,
} from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  LATEXMK_BASE_FLAGS,
  invertPdfJsYToSynctex,
  type CompileResultPayload,
  type ForwardSyncTarget,
} from "@texpulse/shared";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import {
  clampPdfZoom,
  computeFocalScrollPosition,
  computeNextPinchZoomScale,
} from "../utils/layout-ergonomics.js";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type ZoomMode = "fit-width" | "fit-page" | "custom";

export interface PdfViewProps {
  pdfBytes: Uint8Array | null;
  buildId: string | null;
  lastBuild: CompileResultPayload | null;
  compiling: boolean;
  syncTarget: ForwardSyncTarget | null;
  syncStatusMessage: string | null;
  style?: CSSProperties | undefined;
  onCompileNow: (forceFullBuild?: boolean) => void;
  onForwardSearch: () => void;
  onInverseSearch: (page: number, x: number, y: number) => void;
}

interface PdfPageCanvasProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  zoomMode: ZoomMode;
  customScale: number;
  viewportSize: { width: number; height: number };
  syncTarget: ForwardSyncTarget | null;
  pageRef: (el: HTMLDivElement | null) => void;
  onError: (msg: string) => void;
  onInverseSearch: (page: number, x: number, y: number) => void;
  onPageRendered: (page: number, renderedScale: number) => void;
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
  onPageRendered,
}: PdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  const pageViewportRef = useRef<PageViewport | null>(null);
  const naturalHeightPtRef = useRef<number>(792);

  const [renderedScale, setRenderedScale] = useState(1);
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    let cancelled = false;
    let renderTask: RenderTask | null = null;
    setRendering(true);

    void pdf
      .getPage(pageNumber)
      .then((page: PDFPageProxy) => {
        if (cancelled) return;
        const natural = page.getViewport({ scale: 1 });
        naturalHeightPtRef.current = natural.height;

        const scale =
          zoomMode === "custom"
            ? customScale
            : zoomMode === "fit-page"
              ? Math.min(
                  viewportSize.width / natural.width,
                  viewportSize.height / natural.height,
                )
              : viewportSize.width / natural.width;
        const boundedScale = Math.max(scale, 0.25);
        const viewport = page.getViewport({ scale: boundedScale });
        pageViewportRef.current = viewport;
        setRenderedScale(boundedScale);

        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const context = canvas.getContext("2d");
        if (context === null) {
          throw new Error("PDF 2D canvas context is unavailable.");
        }

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${String(Math.floor(viewport.width))}px`;
        canvas.style.height = `${String(Math.floor(viewport.height))}px`;

        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          ...(outputScale === 1
            ? {}
            : { transform: [outputScale, 0, 0, outputScale, 0, 0] }),
        });
        return renderTask.promise.then(() => boundedScale);
      })
      .then((appliedScale) => {
        if (!cancelled && typeof appliedScale === "number") {
          setRendering(false);
          onPageRendered(pageNumber, appliedScale);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled && err instanceof Error && err.name !== "RenderingCancelledException") {
          onError(err.message);
        }
      });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [
    customScale,
    onError,
    onPageRendered,
    pageNumber,
    pdf,
    viewportSize.height,
    viewportSize.width,
    zoomMode,
  ]);

  useEffect(() => {
    if (
      syncTarget !== null &&
      !rendering &&
      targetRef.current !== null &&
      typeof targetRef.current.scrollIntoView === "function"
    ) {
      targetRef.current.scrollIntoView({ block: "center", inline: "nearest" });
    }
  }, [rendering, renderedScale, syncTarget]);

  const dispatchInverseSearch = (event: MouseEvent<HTMLCanvasElement>): void => {
    const canvas = event.currentTarget;
    const viewport = pageViewportRef.current;
    if (viewport === null) return;

    const bounds = canvas.getBoundingClientRect();
    const domX = Math.max(0, event.clientX - bounds.left);
    const domY = Math.max(0, event.clientY - bounds.top);

    // PDF.js returns bottom-left origin coordinates in PDF points;
    // invert to top-left origin before calling SyncTeX `edit`.
    const point = viewport.convertToPdfPoint(domX, domY);
    const pdfX = Number(point[0] ?? 0);
    const pdfYBottomLeft = Number(point[1] ?? 0);
    const synctexY = invertPdfJsYToSynctex(
      pdfYBottomLeft,
      naturalHeightPtRef.current,
    );

    onInverseSearch(pageNumber, Math.max(0, pdfX), synctexY);
  };

  return (
    <div
      ref={pageRef}
      className="tp-pdf-page"
      data-page-number={pageNumber}
      title="Ctrl+Click or Double-Click for Inverse SyncTeX search"
    >
      <canvas
        ref={canvasRef}
        aria-label={`PDF page ${String(pageNumber)}`}
        data-page-number={pageNumber}
        onClick={(event) => {
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            dispatchInverseSearch(event);
          }
        }}
        onDoubleClick={dispatchInverseSearch}
      />
      {syncTarget !== null ? (
        <div
          ref={targetRef}
          className="tp-pdf-sync-highlight"
          data-testid="pdf-sync-highlight"
          style={{
            left: `${String(Math.max(0, syncTarget.x * renderedScale))}px`,
            top: `${String(
              Math.max(0, (syncTarget.y - syncTarget.height) * renderedScale),
            )}px`,
            width: `${String(Math.max(syncTarget.width * renderedScale, 18))}px`,
            height: `${String(Math.max(syncTarget.height * renderedScale, 14))}px`,
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * PDF.js preview pane with scroll/zoom preservation across recompilations and
 * bidirectional SyncTeX (with PDF.js bottom-left to top-left Y-origin inversion).
 */
export function PdfView({
  pdfBytes,
  buildId,
  lastBuild,
  compiling,
  syncTarget,
  syncStatusMessage,
  style,
  onCompileNow,
  onForwardSearch,
  onInverseSearch,
}: PdfViewProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
  const savedScrollRef = useRef({ left: 0, top: 0 });
  const renderedPagesRef = useRef(new Set<number>());
  const page1ScaleRef = useRef(1);
  const zoomCommitTimerRef = useRef<number | null>(null);

  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomMode, setZoomMode] = useState<ZoomMode>("fit-width");
  const [customScale, setCustomScale] = useState(1);
  const [gestureScale, setGestureScale] = useState<number | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 420, height: 600 });
  const [pdfError, setPdfError] = useState<string | null>(null);

  const zoomModeRef = useRef(zoomMode);
  zoomModeRef.current = zoomMode;
  const customScaleRef = useRef(customScale);
  customScaleRef.current = customScale;
  const gestureScaleRef = useRef(gestureScale);
  gestureScaleRef.current = gestureScale;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    const measure = () => {
      setViewportSize({
        width: Math.max(viewport.clientWidth - 36, 120),
        height: Math.max(viewport.clientHeight - 36, 120),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [pdfBytes]);

  useEffect(() => {
    if (pdfBytes === null || pdfBytes.byteLength === 0) {
      setPdf(null);
      return;
    }

    let disposed = false;
    setPdfError(null);
    renderedPagesRef.current.clear();
    pageRefs.current.clear();

    const loadingTask = getDocument({
      data: pdfBytes.slice(),
      enableXfa: false,
      stopAtErrors: false,
    });

    void loadingTask.promise
      .then((doc) => {
        if (disposed) return;
        setPdf(doc);
        setCurrentPage((curr) => Math.min(Math.max(curr, 1), doc.numPages));
      })
      .catch((err: unknown) => {
        if (!disposed) {
          setPdfError(
            err instanceof Error ? err.message : "Failed to load PDF output.",
          );
        }
      });

    return () => {
      disposed = true;
      void loadingTask.destroy();
    };
  }, [buildId, pdfBytes]);

  useEffect(() => {
    renderedPagesRef.current.clear();
  }, [customScale, pdf, viewportSize.height, viewportSize.width, zoomMode]);

  useEffect(() => {
    if (syncTarget !== null) {
      setCurrentPage(syncTarget.page);
    }
  }, [syncTarget]);

  // Native { passive: false } wheel listener for smooth trackpad pinch-zoom & Ctrl+Wheel
  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;

    const handleNativeWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;

      event.preventDefault();
      event.stopPropagation();

      const activeCustom =
        gestureScaleRef.current ??
        (zoomModeRef.current === "custom"
          ? customScaleRef.current
          : Math.max(1, Number(page1ScaleRef.current.toFixed(2))));

      const previousVisualScale =
        gestureScaleRef.current ??
        (zoomModeRef.current === "custom" ? customScaleRef.current : page1ScaleRef.current);

      const nextScale = computeNextPinchZoomScale(activeCustom, event.deltaY);
      const rect = viewport.getBoundingClientRect();
      const cursorOffsetX = Math.max(0, event.clientX - rect.left);
      const cursorOffsetY = Math.max(0, event.clientY - rect.top);
      const nextScroll = computeFocalScrollPosition({
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
        cursorOffsetX,
        cursorOffsetY,
        previousScale: previousVisualScale,
        nextScale,
      });

      gestureScaleRef.current = nextScale;
      zoomModeRef.current = "custom";
      setZoomMode("custom");
      setGestureScale(nextScale);

      savedScrollRef.current = {
        left: nextScroll.scrollLeft,
        top: nextScroll.scrollTop,
      };
      viewport.scrollLeft = nextScroll.scrollLeft;
      viewport.scrollTop = nextScroll.scrollTop;

      if (zoomCommitTimerRef.current !== null) {
        window.clearTimeout(zoomCommitTimerRef.current);
      }
      zoomCommitTimerRef.current = window.setTimeout(() => {
        zoomCommitTimerRef.current = null;
        gestureScaleRef.current = null;
        customScaleRef.current = nextScale;
        setCustomScale(nextScale);
        setGestureScale(null);
      }, 120);
    };

    viewport.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => {
      viewport.removeEventListener("wheel", handleNativeWheel);
      if (zoomCommitTimerRef.current !== null) {
        window.clearTimeout(zoomCommitTimerRef.current);
        zoomCommitTimerRef.current = null;
      }
    };
  }, [pdfBytes]);

  const handlePageRendered = useCallback(
    (pageNumber: number, renderedScale: number) => {
      if (pageNumber === 1) {
        page1ScaleRef.current = renderedScale;
      }
      renderedPagesRef.current.add(pageNumber);
      if (
        pdf !== null &&
        renderedPagesRef.current.size === pdf.numPages &&
        viewportRef.current !== null &&
        syncTarget === null
      ) {
        viewportRef.current.scrollLeft = savedScrollRef.current.left;
        viewportRef.current.scrollTop = savedScrollRef.current.top;
      }
    },
    [pdf, syncTarget],
  );

  const pageNumbers = useMemo(
    () =>
      pdf === null
        ? []
        : Array.from({ length: pdf.numPages }, (_, index) => index + 1),
    [pdf],
  );

  const activeScale = gestureScale ?? customScale;
  const zoomLabel =
    zoomMode === "fit-width"
      ? "Fit Width"
      : zoomMode === "fit-page"
        ? "Fit Page"
        : `${String(Math.round(activeScale * 100))}%`;

  const committedPreviewBase =
    zoomMode === "custom" ? customScale : page1ScaleRef.current;
  const gestureTransformScale =
    gestureScale !== null && committedPreviewBase > 0
      ? gestureScale / committedPreviewBase
      : 1;

  const updateCurrentPageOnScroll = () => {
    const viewport = viewportRef.current;
    if (viewport === null || pageRefs.current.size === 0) return;
    const vpTop = viewport.getBoundingClientRect().top;
    let bestPage = currentPage;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const [pageNo, el] of pageRefs.current) {
      const dist = Math.abs(el.getBoundingClientRect().top - vpTop - 16);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestPage = pageNo;
      }
    }
    setCurrentPage(bestPage);
  };

  if (pdfBytes === null) {
    return (
      <aside
        className="tp-pdf-pane"
        style={style}
        aria-label="PDF preview pane"
        data-testid="pdf-pane"
      >
        <div className="tp-pdf-controls">
          <span className="tabular-nums">PDF Preview · Ready</span>
          <div className="tp-pdf-controls-group">
            <button
              type="button"
              className="tp-icon-btn"
              disabled={compiling}
              onClick={() => onCompileNow(true)}
            >
              {compiling ? "Compiling..." : "Full Build"}
            </button>
          </div>
        </div>
        <div className="tp-pdf-stage">
          <div className="tp-pdf-placeholder-card">
            <h2 className="tp-pdf-placeholder-title">
              {lastBuild?.status === "failed" ? "Compilation Failed" : "PDF Preview Ready"}
            </h2>
            <p className="tp-pdf-placeholder-desc">
              {lastBuild?.status === "failed"
                ? lastBuild.failureReason ?? "Inspect the build log for details."
                : "Press Compile (Ctrl+↵) to build main.tex with MiKTeX latexmk and warm the Tier 2 mylatexformat .fmt preamble cache."}
            </p>
            <div className="tp-pdf-meta-grid">
              <span className="tp-pdf-meta-label">Root Document</span>
              <span className="tp-pdf-meta-value">main.tex</span>
              <span className="tp-pdf-meta-label">Compiler Flags</span>
              <span className="tp-pdf-meta-value">{LATEXMK_BASE_FLAGS.join(" ")}</span>
              <span className="tp-pdf-meta-label">SyncTeX Origin</span>
              <span className="tp-pdf-meta-value">Bottom-left → Top-left Y-inverted</span>
            </div>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="tp-pdf-pane"
      style={style}
      aria-label="PDF preview pane"
      data-testid="pdf-pane"
    >
      <div className="tp-pdf-controls">
        <div className="tp-pdf-controls-group">
          <span className="tabular-nums" data-testid="pdf-page-counter">
            Page {String(currentPage)} / {String(pdf?.numPages ?? 0)}
          </span>
          {lastBuild !== null ? (
            <span className="tp-file-badge" data-testid="pdf-tier-badge">
              {lastBuild.tier === "tier2-fmt"
                ? lastBuild.preambleCacheHit
                  ? "fmt cache"
                  : "fmt dump"
                : "latexmk"}
            </span>
          ) : null}
          {syncStatusMessage !== null ? (
            <span className="tp-outline-line" data-testid="synctex-status">
              {syncStatusMessage}
            </span>
          ) : null}
        </div>

        <div className="tp-pdf-controls-group">
          <button
            type="button"
            className="tp-icon-btn"
            onClick={() => {
              const base = gestureScale ?? customScale;
              const next = clampPdfZoom(base - 0.15);
              setGestureScale(null);
              setZoomMode("custom");
              setCustomScale(next);
            }}
            aria-label="Zoom out"
          >
            -
          </button>
          <button
            type="button"
            className="tp-icon-btn"
            onClick={() => {
              setGestureScale(null);
              setZoomMode("fit-width");
            }}
            title="Fit width"
          >
            <span className="tabular-nums" data-testid="pdf-zoom-label">
              {zoomLabel}
            </span>
          </button>
          <button
            type="button"
            className="tp-icon-btn"
            onClick={() => {
              const base = gestureScale ?? customScale;
              const next = clampPdfZoom(base + 0.15);
              setGestureScale(null);
              setZoomMode("custom");
              setCustomScale(next);
            }}
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            className="tp-icon-btn"
            onClick={onForwardSearch}
            disabled={compiling}
            data-testid="sync-forward-button"
            title="Forward SyncTeX search from cursor to PDF"
          >
            Sync → PDF
          </button>
          <button
            type="button"
            className="tp-icon-btn"
            disabled={compiling}
            onClick={() => onCompileNow(true)}
            data-testid="full-build-button"
            title="Force full Tier 3 latexmk multi-pass rebuild"
          >
            Full
          </button>
        </div>
      </div>

      <div
        className="tp-pdf-viewport"
        ref={viewportRef}
        data-testid="pdf-viewport"
        onScroll={(event) => {
          savedScrollRef.current = {
            left: event.currentTarget.scrollLeft,
            top: event.currentTarget.scrollTop,
          };
          updateCurrentPageOnScroll();
        }}
      >
        {pdfError !== null ? (
          <div className="tp-pdf-placeholder-card">
            <h2 className="tp-pdf-placeholder-title">PDF Render Error</h2>
            <p className="tp-pdf-placeholder-desc">{pdfError}</p>
          </div>
        ) : (
          <div
            className="tp-pdf-pages"
            style={
              gestureScale !== null
                ? {
                    transform: `scale(${String(gestureTransformScale)})`,
                    transformOrigin: "top center",
                  }
                : undefined
            }
          >
            {pageNumbers.map((pageNumber) => (
              <PdfPageCanvas
                key={pageNumber}
                pdf={pdf!}
                pageNumber={pageNumber}
                zoomMode={zoomMode}
                customScale={customScale}
                viewportSize={viewportSize}
                syncTarget={syncTarget?.page === pageNumber ? syncTarget : null}
                pageRef={(el) => {
                  if (el === null) {
                    pageRefs.current.delete(pageNumber);
                  } else {
                    pageRefs.current.set(pageNumber, el);
                  }
                }}
                onError={setPdfError}
                onInverseSearch={onInverseSearch}
                onPageRendered={handlePageRendered}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
