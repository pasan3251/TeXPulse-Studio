import type {
  DiagnosticCategory,
  DiagnosticItem,
  ErrorFixProposal,
  PackageSuggestionAction,
} from "@texpulse/shared";

interface DiagnosticsDrawerProps {
  diagnostics: readonly DiagnosticItem[];
  activeTab: DiagnosticCategory;
  onTabChange: (tab: DiagnosticCategory) => void;
  failureReason: string | null;
  activeFilePath: string;
  aiFixLoadingId?: string | null | undefined;
  aiFixProposal?: { diagnosticId: string; proposal: ErrorFixProposal } | null | undefined;
  onSelectDiagnostic: (item: DiagnosticItem) => void;
  onApplyPackageQuickFix: (action: PackageSuggestionAction) => void;
  onRequestAiFix: (item: DiagnosticItem) => void;
  onApplyAiFix: (proposal: ErrorFixProposal) => void;
  onDiscardAiFix: () => void;
  onClose: () => void;
}

/**
 * Categorized Apple HIG diagnostics drawer surfacing settled `.log` / `.blg`
 * HumanReadableLogs rules, raw excerpts, click-to-jump, package quick-fixes,
 * and v2.0 local-first `Fix with AI` inline diff previews.
 */
export function DiagnosticsDrawer({
  diagnostics,
  activeTab,
  onTabChange,
  failureReason,
  activeFilePath,
  aiFixLoadingId,
  aiFixProposal,
  onSelectDiagnostic,
  onApplyPackageQuickFix,
  onRequestAiFix,
  onApplyAiFix,
  onDiscardAiFix,
  onClose,
}: DiagnosticsDrawerProps) {
  const errorItems = diagnostics.filter((item) => item.category === "error");
  const warningItems = diagnostics.filter((item) => item.category === "warning");
  const typesettingItems = diagnostics.filter((item) => item.category === "typesetting");

  const visibleItems =
    activeTab === "error"
      ? errorItems
      : activeTab === "warning"
        ? warningItems
        : typesettingItems;

  return (
    <div className="tp-diagnostics-drawer" data-testid="diagnostics-drawer">
      <div className="tp-drawer-bar">
        <div className="tp-drawer-tabs" role="tablist" aria-label="Diagnostic categories">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "error"}
            className={`tp-drawer-tab${activeTab === "error" ? " active" : ""}`}
            data-testid="diag-tab-errors"
            onClick={() => onTabChange("error")}
          >
            Errors ({String(errorItems.length)})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "warning"}
            className={`tp-drawer-tab${activeTab === "warning" ? " active" : ""}`}
            data-testid="diag-tab-warnings"
            onClick={() => onTabChange("warning")}
          >
            Warnings ({String(warningItems.length)})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "typesetting"}
            className={`tp-drawer-tab${activeTab === "typesetting" ? " active" : ""}`}
            data-testid="diag-tab-typesetting"
            onClick={() => onTabChange("typesetting")}
          >
            Typesetting / Boxes ({String(typesettingItems.length)})
          </button>
        </div>
        <button
          type="button"
          className="tp-icon-btn"
          data-testid="diag-close-btn"
          onClick={onClose}
        >
          Close
        </button>
      </div>

      <div className="tp-drawer-list">
        {activeTab === "error" && failureReason && errorItems.length === 0 ? (
          <div className="tp-diag-card" data-testid="diag-card">
            <div className="tp-diag-card-heading">
              <span className="tp-diag-badge error">compiler</span>
              <span className="tp-diag-title">{failureReason}</span>
            </div>
          </div>
        ) : null}

        {visibleItems.length === 0 && !(activeTab === "error" && failureReason && errorItems.length === 0) ? (
          <div className="tp-pdf-placeholder-desc" style={{ margin: "4px 2px" }}>
            No {activeTab === "typesetting" ? "typesetting box notices" : `${activeTab}s`} detected across open workspace or settled build logs ({activeFilePath}).
          </div>
        ) : (
          visibleItems.map((item) => {
            const activeProposal =
              aiFixProposal?.diagnosticId === item.id ? aiFixProposal.proposal : null;
            const isFixing = aiFixLoadingId === item.id;

            return (
              <div key={item.id} className="tp-diag-card" data-testid="diag-card">
                <button
                  type="button"
                  className="tp-diag-card-top"
                  data-testid="diag-card-jump"
                  onClick={() => onSelectDiagnostic(item)}
                  title={`Jump to ${item.file}:${String(item.line)}`}
                >
                  <span className="tp-diag-card-heading">
                    <span className={`tp-diag-badge ${item.category}`}>
                      {item.category === "typesetting" ? "box" : item.category}
                    </span>
                    <span className="tp-diag-title">{item.humanTitle}</span>
                  </span>
                  <span className="tp-outline-line tabular-nums">
                    {item.file}:{String(item.line)}
                  </span>
                </button>

                {item.explanation ? (
                  <p className="tp-diag-explanation">{item.explanation}</p>
                ) : null}

                <div className="tp-diag-actions">
                  {item.quickFix?.type === "insert-package" ? (
                    <button
                      type="button"
                      className="tp-quickfix-btn"
                      data-testid="quick-fix-package-btn"
                      onClick={() => {
                        if (item.quickFix) {
                          onApplyPackageQuickFix(item.quickFix);
                        }
                      }}
                    >
                      + Add \usepackage&#123;{item.quickFix.packageName}&#125; to preamble
                    </button>
                  ) : null}

                  {item.category !== "typesetting" ? (
                    <button
                      type="button"
                      className="tp-sidebar-action-btn"
                      style={{ flex: "0 0 auto" }}
                      data-testid="fix-with-ai-btn"
                      disabled={isFixing}
                      onClick={() => onRequestAiFix(item)}
                    >
                      {isFixing ? "Analyzing..." : "Fix with AI"}
                    </button>
                  ) : null}
                </div>

                {activeProposal !== null ? (
                  <div className="tp-ai-diff-preview" data-testid="ai-diff-preview">
                    <div className="tp-ai-diff-header">
                      <span>{activeProposal.summary}</span>
                      <span className="tp-outline-line tabular-nums">
                        {activeProposal.targetFile}:{String(activeProposal.startLine)}
                      </span>
                    </div>
                    <div className="tp-ai-diff-lines">
                      {activeProposal.originalSnippet.split(/\r?\n/u).map((line, idx) => (
                        <div key={`old-${String(idx)}`} className="tp-diff-line remove">
                          - {line}
                        </div>
                      ))}
                      {activeProposal.replacementSnippet.split(/\r?\n/u).map((line, idx) => (
                        <div key={`new-${String(idx)}`} className="tp-diff-line add">
                          + {line}
                        </div>
                      ))}
                    </div>
                    <div className="tp-ai-diff-actions">
                      <button
                        type="button"
                        className="tp-quickfix-btn"
                        data-testid="apply-ai-fix-btn"
                        onClick={() => onApplyAiFix(activeProposal)}
                      >
                        Apply & Recompile
                      </button>
                      <button
                        type="button"
                        className="tp-icon-btn"
                        data-testid="discard-ai-fix-btn"
                        onClick={onDiscardAiFix}
                      >
                        Discard
                      </button>
                    </div>
                  </div>
                ) : null}

                {item.rawLog.trim() !== "" ? (
                  <details className="tp-diag-details" data-testid="diag-raw-details">
                    <summary>Raw log excerpt</summary>
                    <pre className="tp-diag-raw">{item.rawLog}</pre>
                  </details>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
