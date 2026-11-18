import type { BuildDiagnostic } from "../../ipc/build-contracts.js";

interface ProblemsPanelProps {
  diagnostics: readonly BuildDiagnostic[];
  onClose: () => void;
  onSelect: (diagnostic: BuildDiagnostic) => void;
}

export function ProblemsPanel({
  diagnostics,
  onClose,
  onSelect,
}: ProblemsPanelProps) {
  const counts = countSeverities(diagnostics);
  return (
    <section className="problems-panel" aria-label="Problems">
      <header>
        <div>
          <strong>Problems</strong>
          <span>
            {String(counts.error)} errors · {String(counts.warning)} warnings ·{" "}
            {String(counts.info)} info
          </span>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close Problems panel"
          onClick={onClose}
        >
          Close
        </button>
      </header>
      {diagnostics.length === 0 ? (
        <p className="problems-empty">The current build has no diagnostics.</p>
      ) : (
        <ul className="problem-list">
          {diagnostics.map((diagnostic, index) => {
            const location = diagnosticLocation(diagnostic);
            const canNavigate =
              diagnostic.file !== null && diagnostic.line !== null;
            return (
              <li
                key={`${diagnostic.source}-${String(index)}-${diagnostic.message}`}
                className={`problem problem-${diagnostic.severity}`}
              >
                <button
                  type="button"
                  disabled={!canNavigate}
                  aria-label={`${severityLabel(diagnostic.severity)}: ${diagnostic.message}${location === null ? "" : ` at ${location}`}`}
                  onClick={() => {
                    onSelect(diagnostic);
                  }}
                >
                  <span
                    className={`problem-severity severity-${diagnostic.severity}`}
                  >
                    {severityLabel(diagnostic.severity)}
                  </span>
                  <span className="problem-copy">
                    <strong>{diagnostic.message}</strong>
                    <span>
                      {location ?? "Build"} · {diagnostic.source}
                    </span>
                    {diagnostic.rawExcerpt === "" ? null : (
                      <code>{diagnostic.rawExcerpt}</code>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function countSeverities(diagnostics: readonly BuildDiagnostic[]) {
  return diagnostics.reduce(
    (counts, diagnostic) => {
      counts[diagnostic.severity] += 1;
      return counts;
    },
    { error: 0, warning: 0, info: 0 },
  );
}

function diagnosticLocation(diagnostic: BuildDiagnostic): string | null {
  if (diagnostic.file === null) {
    return null;
  }
  const line = diagnostic.line === null ? "" : `:${String(diagnostic.line)}`;
  const column =
    diagnostic.column === null ? "" : `:${String(diagnostic.column)}`;
  return `${diagnostic.file}${line}${column}`;
}

function severityLabel(severity: BuildDiagnostic["severity"]): string {
  switch (severity) {
    case "error":
      return "Error";
    case "warning":
      return "Warning";
    case "info":
      return "Info";
  }
}
