import katex from "katex";
import { useMemo } from "react";
import type { ActiveMathBlock } from "@texpulse/shared";

interface MathPreviewPopoverProps {
  mathBlock: ActiveMathBlock;
  topPx: number;
}

/**
 * Tier 1 Live Math Preview Popover. Renders the enclosing `$...$`, `$$...$$`,
 * `\begin{equation}`, or `\begin{align}` node via KaTeX in <16ms.
 */
export function MathPreviewPopover({ mathBlock, topPx }: MathPreviewPopoverProps) {
  const rendered = useMemo(() => {
    const start = performance.now();
    if (mathBlock.latex.trim() === "") {
      return {
        html: null as string | null,
        error: null as string | null,
        durationMs: performance.now() - start,
      };
    }

    try {
      const html = katex.renderToString(mathBlock.latex, {
        displayMode: mathBlock.displayMode,
        throwOnError: true,
        strict: false,
      });
      return {
        html,
        error: null,
        durationMs: performance.now() - start,
      };
    } catch (err) {
      // Fallback render with throwOnError: false so partial typing still previews nicely
      const fallbackHtml = katex.renderToString(mathBlock.latex, {
        displayMode: mathBlock.displayMode,
        throwOnError: false,
        strict: false,
      });
      return {
        html: fallbackHtml,
        error: err instanceof Error ? err.message : "KaTeX parse error",
        durationMs: performance.now() - start,
      };
    }
  }, [mathBlock.displayMode, mathBlock.latex]);

  return (
    <aside
      className="tp-math-popover"
      style={{ top: `${String(Math.max(12, topPx))}px` }}
      aria-label="Live math preview"
      data-testid="live-math-popover"
    >
      <div className="tp-math-popover-header">
        <span className="tp-math-env-tag">{mathBlock.delimiter}</span>
        <span className="tabular-nums">
          Line {String(mathBlock.line)} · KaTeX {rendered.durationMs.toFixed(1)} ms
        </span>
      </div>
      <div className="tp-math-popover-body">
        {rendered.html === null ? (
          <span className="tp-math-placeholder">
            Type LaTeX math inside \begin&#123;{mathBlock.delimiter}&#125;...
          </span>
        ) : (
          <div dangerouslySetInnerHTML={{ __html: rendered.html }} />
        )}
        {rendered.error !== null && mathBlock.latex.trim() !== "" ? (
          <div className="tp-math-error">{rendered.error}</div>
        ) : null}
      </div>
    </aside>
  );
}
