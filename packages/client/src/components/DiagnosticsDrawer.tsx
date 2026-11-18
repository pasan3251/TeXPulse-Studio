import type {
  DiagnosticCategory,
  DiagnosticItem,
  PackageSuggestionAction,
} from "@texpulse/shared";

interface DiagnosticsDrawerProps {
  diagnostics: readonly DiagnosticItem[];
  activeTab: DiagnosticCategory;
  onTabChange: (tab: DiagnosticCategory) => void;
  failureReason: string | null;
  activeFilePath: string;
  onSelectDiagnostic: (item: DiagnosticItem) => void;
  onApplyPackageQuickFix: (action: PackageSuggestionAction) => void;
  onClose: () => void;
}

/**
 * Categorized Apple HIG diagnostics drawer surfacing settled `.log` / `.blg`
 * HumanReadableLogs rules, raw excerpts, click-to-jump, and one-click package fixes.
 */
export function DiagnosticsDrawer({
  diagnostics,
  activeTab,
  onTabChange,
  failureReason,
  activeFilePath,
  onSelectDiagnostic,
  onApplyPackageQuickFix,
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
          visibleItems.map((item) => (
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

              {item.quickFix?.type === "insert-package" ? (
                <div className="tp-diag-actions">
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
                </div>
              ) : null}

              {item.rawLog.trim() !== "" ? (
                <details className="tp-diag-details" data-testid="diag-raw-details">
                  <summary>Raw log excerpt</summary>
                  <pre className="tp-diag-raw">{item.rawLog}</pre>
                </details>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
