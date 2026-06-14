import { useEffect, useState, type FormEvent } from "react";

import type {
  ProjectSettings,
  ToolchainReport,
} from "../../ipc/settings-contracts.js";
import type { GlobalSettings } from "../../settings/settings-types.js";

interface SettingsDialogProps {
  busy: boolean;
  globalSettings: GlobalSettings;
  issues: readonly string[];
  mode: "settings" | "setup";
  projectSettings: ProjectSettings | null;
  rootOptions: readonly string[];
  toolchain: ToolchainReport | null;
  onCheckToolchain: (customBinDirectory: string | null) => void;
  onCleanBuild: () => void;
  onCleanupAuxiliary: () => void;
  onClearLocalData: () => void;
  onClose: () => void;
  onExportSupportLog: () => void;
  onSave: (
    globalSettings: GlobalSettings,
    projectSettings: ProjectSettings | null,
  ) => void;
  onSkipSetup: (
    globalSettings: GlobalSettings,
    projectSettings: ProjectSettings | null,
  ) => void;
}

export function SettingsDialog({
  busy,
  globalSettings,
  issues,
  mode,
  projectSettings,
  rootOptions,
  toolchain,
  onCheckToolchain,
  onCleanBuild,
  onCleanupAuxiliary,
  onClearLocalData,
  onClose,
  onExportSupportLog,
  onSave,
  onSkipSetup,
}: SettingsDialogProps) {
  const [globalDraft, setGlobalDraft] = useState(globalSettings);
  const [projectDraft, setProjectDraft] = useState(projectSettings);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setGlobalDraft(globalSettings);
    setProjectDraft(projectSettings);
    setError(null);
  }, [globalSettings, projectSettings, mode]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const validationError = validateDraft(globalDraft, projectDraft);
    setError(validationError);
    if (validationError === null) {
      onSave(globalDraft, projectDraft);
    }
  };

  return (
    <div className="dialog-backdrop">
      <section
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header>
          <div>
            <p className="eyebrow">
              {mode === "setup" ? "Toolchain setup" : "Preferences"}
            </p>
            <h2 id="settings-title">
              {mode === "setup"
                ? "Prepare TeXPulse Studio"
                : "Project and build settings"}
            </h2>
          </div>
          {mode === "settings" ? (
            <button
              type="button"
              className="icon-button"
              disabled={busy}
              onClick={onClose}
            >
              Close
            </button>
          ) : null}
        </header>

        <form noValidate onSubmit={submit}>
          {issues.length > 0 ? (
            <div className="settings-warning" role="status">
              <strong>Settings recovery notice</strong>
              {issues.map((issue) => (
                <span key={issue}>{issue}</span>
              ))}
            </div>
          ) : null}

          <fieldset>
            <legend>Toolchain</legend>
            <label>
              <span>Custom executable directory</span>
              <input
                aria-label="Custom executable directory"
                value={globalDraft.customBinDirectory ?? ""}
                placeholder="Use system PATH"
                onChange={(event) => {
                  setGlobalDraft({
                    ...globalDraft,
                    customBinDirectory:
                      event.currentTarget.value.trim() === ""
                        ? null
                        : event.currentTarget.value,
                  });
                }}
              />
            </label>
            <div className="settings-row">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  onCheckToolchain(globalDraft.customBinDirectory);
                }}
              >
                {busy ? "Checking..." : "Run real self-test"}
              </button>
              <span
                className={`readiness readiness-${toolchain?.ready === true ? "ready" : "unknown"}`}
              >
                {toolchain === null
                  ? "Readiness not checked"
                  : toolchain.ready
                    ? "Toolchain ready"
                    : "Toolchain not ready"}
              </span>
            </div>
            {toolchain !== null ? (
              <div className="toolchain-results">
                <strong>Self-test: {toolchain.selfTest.status}</strong>
                <span>{toolchain.selfTest.message}</span>
                <ul>
                  {toolchain.tools.map((tool) => (
                    <li key={tool.id}>
                      <span>{tool.label}</span>
                      <span>{tool.state}</span>
                      <code>
                        {`Version: ${tool.version ?? "unknown"} | Path: ${tool.path ?? "not found"}`}
                      </code>
                      {tool.detail !== null ? (
                        <span className="tool-detail">{tool.detail}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {toolchain.issues.length > 0 ? (
                  <div className="toolchain-issues">
                    {toolchain.issues.map((issue) => (
                      <span key={`${issue.tool}-${issue.message}`}>
                        <strong>{issue.severity}</strong>: {issue.message}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </fieldset>

          <fieldset>
            <legend>Global editor defaults</legend>
            <div className="settings-grid">
              <label>
                <span>Autosave</span>
                <input
                  type="checkbox"
                  checked={globalDraft.autosave}
                  onChange={(event) => {
                    setGlobalDraft({
                      ...globalDraft,
                      autosave: event.currentTarget.checked,
                    });
                  }}
                />
              </label>
              <label>
                <span>Automatic builds for new projects</span>
                <input
                  type="checkbox"
                  checked={globalDraft.autoBuild}
                  onChange={(event) => {
                    setGlobalDraft({
                      ...globalDraft,
                      autoBuild: event.currentTarget.checked,
                    });
                  }}
                />
              </label>
              <label>
                <span>Automatic build delay (ms)</span>
                <input
                  aria-label="Automatic build delay"
                  type="number"
                  min={200}
                  max={5000}
                  value={globalDraft.debounceMs}
                  onChange={(event) => {
                    setGlobalDraft({
                      ...globalDraft,
                      debounceMs: Number(event.currentTarget.value),
                    });
                  }}
                />
              </label>
              <label>
                <span>Compile timeout (ms)</span>
                <input
                  aria-label="Compile timeout"
                  type="number"
                  min={1000}
                  max={600000}
                  value={globalDraft.compileTimeoutMs}
                  onChange={(event) => {
                    setGlobalDraft({
                      ...globalDraft,
                      compileTimeoutMs: Number(event.currentTarget.value),
                    });
                  }}
                />
              </label>
              <label>
                <span>Editor font size</span>
                <input
                  aria-label="Editor font size"
                  type="number"
                  min={10}
                  max={28}
                  value={globalDraft.editorFontSize}
                  onChange={(event) => {
                    setGlobalDraft({
                      ...globalDraft,
                      editorFontSize: Number(event.currentTarget.value),
                    });
                  }}
                />
              </label>
              <label>
                <span>Default PDF zoom</span>
                <select
                  aria-label="Default PDF zoom"
                  value={globalDraft.pdfZoomMode}
                  onChange={(event) => {
                    setGlobalDraft({
                      ...globalDraft,
                      pdfZoomMode: event.currentTarget.value as
                        | "fit-page"
                        | "fit-width",
                    });
                  }}
                >
                  <option value="fit-width">Fit width</option>
                  <option value="fit-page">Fit page</option>
                </select>
              </label>
            </div>
          </fieldset>

          {projectDraft !== null ? (
            <fieldset>
              <legend>Open project</legend>
              <div className="settings-grid">
                <label>
                  <span>Root file</span>
                  <select
                    aria-label="Root file"
                    value={projectDraft.rootFile ?? ""}
                    onChange={(event) => {
                      setProjectDraft({
                        ...projectDraft,
                        rootFile:
                          event.currentTarget.value === ""
                            ? null
                            : event.currentTarget.value,
                      });
                    }}
                  >
                    <option value="">No root selected</option>
                    {rootOptions.map((path) => (
                      <option key={path} value={path}>
                        {path}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Recipe</span>
                  <select
                    aria-label="Compile recipe"
                    value={projectDraft.recipe}
                    onChange={(event) => {
                      setProjectDraft({
                        ...projectDraft,
                        recipe: event.currentTarget
                          .value as ProjectSettings["recipe"],
                      });
                    }}
                  >
                    <option value="latexmk-pdf">pdfLaTeX</option>
                    <option value="latexmk-xelatex">XeLaTeX</option>
                    <option value="latexmk-lualatex">LuaLaTeX</option>
                  </select>
                </label>
                <label>
                  <span>Build directory</span>
                  <input
                    aria-label="Build directory"
                    value={projectDraft.buildDirectory}
                    onChange={(event) => {
                      setProjectDraft({
                        ...projectDraft,
                        buildDirectory: event.currentTarget.value,
                      });
                    }}
                  />
                </label>
                <label className="checkbox-label">
                  <span>Automatic builds</span>
                  <input
                    type="checkbox"
                    checked={projectDraft.autoBuild}
                    onChange={(event) => {
                      setProjectDraft({
                        ...projectDraft,
                        autoBuild: event.currentTarget.checked,
                      });
                    }}
                  />
                </label>
              </div>
              <label className="trust-setting">
                <input
                  type="checkbox"
                  checked={projectDraft.allowLatexmkRc}
                  onChange={(event) => {
                    setProjectDraft({
                      ...projectDraft,
                      allowLatexmkRc: event.currentTarget.checked,
                    });
                  }}
                />
                <span>
                  Trust latexmk configuration files for this project, including
                  `.latexmkrc`. They are Perl and may execute commands while
                  loading.
                </span>
              </label>
              <div className="settings-row">
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy || projectDraft.rootFile === null}
                  onClick={onCleanBuild}
                >
                  Clean build
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={onCleanupAuxiliary}
                >
                  Clean auxiliary files
                </button>
              </div>
            </fieldset>
          ) : null}

          {mode === "settings" ? (
            <fieldset>
              <legend>Support and recovery</legend>
              <p className="settings-help">
                Support logs contain bounded application events, not full
                document content. Exported paths are redacted.
              </p>
              <div className="settings-row">
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={onExportSupportLog}
                >
                  Export support log
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={onClearLocalData}
                >
                  Clear recovery and logs
                </button>
              </div>
            </fieldset>
          ) : null}

          {error !== null ? (
            <p className="settings-error" role="alert">
              {error}
            </p>
          ) : null}

          <footer>
            {mode === "setup" ? (
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  onSkipSetup(globalDraft, projectDraft);
                }}
              >
                Skip self-test and continue
              </button>
            ) : null}
            <button type="submit" className="button" disabled={busy}>
              {busy ? "Saving..." : "Save settings"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function validateDraft(
  globalSettings: GlobalSettings,
  projectSettings: ProjectSettings | null,
): string | null {
  if (
    !Number.isInteger(globalSettings.debounceMs) ||
    globalSettings.debounceMs < 200 ||
    globalSettings.debounceMs > 5_000
  ) {
    return "Automatic build delay must be between 200 and 5000 milliseconds.";
  }
  if (
    !Number.isInteger(globalSettings.compileTimeoutMs) ||
    globalSettings.compileTimeoutMs < 1_000 ||
    globalSettings.compileTimeoutMs > 600_000
  ) {
    return "Compile timeout must be between 1000 and 600000 milliseconds.";
  }
  if (
    !Number.isInteger(globalSettings.editorFontSize) ||
    globalSettings.editorFontSize < 10 ||
    globalSettings.editorFontSize > 28
  ) {
    return "Editor font size must be between 10 and 28 pixels.";
  }
  if (
    projectSettings !== null &&
    (projectSettings.buildDirectory.trim() === "" ||
      projectSettings.buildDirectory === ".")
  ) {
    return "Build directory must be a project-relative child directory.";
  }
  return null;
}
