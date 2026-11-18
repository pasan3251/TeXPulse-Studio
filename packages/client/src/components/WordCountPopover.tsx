import type { TexCountResultPayload, TexCountSectionBreakdown } from "@texpulse/shared";

interface WordCountPopoverProps {
  counts: TexCountResultPayload;
  loading: boolean;
  onRefresh: () => void;
  onSelectSection: (section: TexCountSectionBreakdown) => void;
  onClose: () => void;
}

/**
 * Clean 1px-bordered popover surfacing per-section `texcount` word, header,
 * caption, and math counts with `tabular-nums`.
 */
export function WordCountPopover({
  counts,
  loading,
  onRefresh,
  onSelectSection,
  onClose,
}: WordCountPopoverProps) {
  return (
    <div
      className="tp-wordcount-popover"
      data-testid="word-count-popover"
      role="dialog"
      aria-label="TeXcount Word Breakdown"
    >
      <div className="tp-wordcount-header">
        <span className="tp-wordcount-title tabular-nums">
          Word Count · {counts.source === "texcount" ? "texcount -sub=section" : "AST Fallback"}
        </span>
        <div className="tp-popover-actions">
          <button
            type="button"
            className="tp-icon-btn"
            onClick={onRefresh}
            disabled={loading}
          >
            {loading ? "Counting..." : "Refresh"}
          </button>
          <button
            type="button"
            className="tp-icon-btn"
            data-testid="word-count-close"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>

      <div className="tp-wordcount-summary tabular-nums">
        <div className="tp-wordcount-stat">
          <span className="tp-pdf-meta-label">Words in text</span>
          <strong>{String(counts.wordsInText)}</strong>
        </div>
        <div className="tp-wordcount-stat">
          <span className="tp-pdf-meta-label">Headers</span>
          <strong>{String(counts.wordsInHeaders)}</strong>
        </div>
        <div className="tp-wordcount-stat">
          <span className="tp-pdf-meta-label">Captions</span>
          <strong>{String(counts.wordsInCaptions)}</strong>
        </div>
        <div className="tp-wordcount-stat">
          <span className="tp-pdf-meta-label">Math ($ / eq)</span>
          <strong>
            {String(counts.mathInlines)} / {String(counts.mathDisplay)}
          </strong>
        </div>
      </div>

      <table className="tp-wordcount-table tabular-nums">
        <thead>
          <tr>
            <th>Section</th>
            <th>Text</th>
            <th>Hdr</th>
            <th>Math</th>
          </tr>
        </thead>
        <tbody>
          {counts.sections.map((sec, idx) => (
            <tr
              key={`${sec.title}-${String(idx)}`}
              data-testid="word-count-section-row"
              onClick={() => onSelectSection(sec)}
              title={`Jump to ${sec.filePath ?? "main.tex"}:${String(sec.line ?? 1)}`}
            >
              <td className="tp-wordcount-sec-title">{sec.title}</td>
              <td>{String(sec.wordsInText)}</td>
              <td>{String(sec.wordsInHeaders)}</td>
              <td>{String(sec.mathInlines + sec.mathDisplay)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
