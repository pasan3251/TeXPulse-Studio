import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type CSSProperties,
} from "react";

import type { TeXPulseApi } from "../ipc/api-contract.js";
import type { BuildDiagnostic } from "../ipc/build-contracts.js";
import { BuildLog } from "./components/BuildLog.js";
import { ProblemsPanel } from "./components/ProblemsPanel.js";
import { ProjectExplorer } from "./components/ProjectExplorer.js";
import {
  LiveBuildCoordinator,
  type LiveBuildSettings,
} from "./live-build-coordinator.js";
import {
  initialWorkspaceState,
  isBufferModified,
  workspaceReducer,
  type EditorBuffer,
  type WorkspaceState,
} from "./workspace-state.js";
import {
  loadWorkspacePreferences,
  saveWorkspacePreferences,
} from "./workspace-persistence.js";

const EditorPane = lazy(async () => {
  const module = await import("./components/EditorPane.js");
  return { default: module.EditorPane };
});

const PdfViewer = lazy(async () => {
  const module = await import("./components/PdfViewer.js");
  return { default: module.PdfViewer };
});

interface AppProps {
  api?: TeXPulseApi;
}

function persistWorkspaceState(
  storage: Pick<Storage, "setItem">,
  state: WorkspaceState,
): boolean {
  if (state.project === null) {
    return false;
  }
  const bufferViews = Object.fromEntries(
    Object.values(state.buffers).map((buffer) => [
      buffer.path,
      { cursor: buffer.cursor, scrollTop: buffer.scrollTop },
    ]),
  );
  return saveWorkspacePreferences(storage, state.project.projectId, {
    openPaths: Object.keys(state.buffers),
    activePath: state.activePath,
    bufferViews,
    paneRatio: state.paneRatio,
    settings: state.settings,
  });
}

export function App({ api = window.texpulse }: AppProps) {
  const [state, dispatch] = useReducer(workspaceReducer, initialWorkspaceState);
  const stateRef = useRef(state);
  const coordinatorRef = useRef<LiveBuildCoordinator | null>(null);
  const saveTailRef = useRef<Promise<void>>(Promise.resolve());
  const restoredProjectIdRef = useRef<string | null>(null);
  const openRequestRef = useRef(0);
  const splitRef = useRef<HTMLDivElement>(null);
  const draggingSplitRef = useRef(false);
  const diagnosticRequestRef = useRef(0);
  stateRef.current = state;

  const activeBuffer =
    state.activePath === null ? undefined : state.buffers[state.activePath];
  const modifiedPaths = useMemo(
    () =>
      new Set(
        Object.values(state.buffers)
          .filter(isBufferModified)
          .map((buffer) => buffer.path),
      ),
    [state.buffers],
  );

  const openFile = async (path: string): Promise<void> => {
    if (stateRef.current.buffers[path] !== undefined) {
      dispatch({ type: "file-selected", path });
      return;
    }

    dispatch({ type: "file-loading", path });
    const result = await api.readTextFile({ path });
    if (result.ok) {
      dispatch({ type: "file-opened", file: result.value });
    } else {
      dispatch({
        type: "operation-failed",
        message: result.error.message,
        path,
      });
    }
  };

  const performSave = async (
    requestedPaths: string[] | null,
    announce: boolean,
  ): Promise<boolean> => {
    const selected =
      requestedPaths === null
        ? Object.values(stateRef.current.buffers)
        : requestedPaths
            .map((path) => stateRef.current.buffers[path])
            .filter((buffer): buffer is EditorBuffer => buffer !== undefined);
    const buffers = selected.filter(isBufferModified);
    if (buffers.length === 0) {
      return true;
    }

    dispatch({
      type: "save-started",
      paths: buffers.map((buffer) => buffer.path),
    });
    const results = await Promise.all(
      buffers.map(async (buffer) => {
        const result = await api.writeTextFile({
          path: buffer.path,
          content: buffer.content,
          expectedVersion: buffer.version,
        });
        if (result.ok) {
          dispatch({
            type: "save-succeeded",
            file: result.value,
            announce,
          });
          return {
            ok: true as const,
            path: buffer.path,
            savedContent: result.value.content,
          };
        }
        dispatch({
          type: "operation-failed",
          message: result.error.message,
          path: buffer.path,
        });
        return { ok: false as const, path: buffer.path };
      }),
    );

    return results.every(
      (result) =>
        result.ok &&
        stateRef.current.buffers[result.path]?.content === result.savedContent,
    );
  };

  const savePaths = (
    requestedPaths: string[] | null,
    announce: boolean,
  ): Promise<boolean> => {
    const operation = saveTailRef.current.then(() =>
      performSave(requestedPaths, announce),
    );
    saveTailRef.current = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  };

  const openProject = async (): Promise<void> => {
    coordinatorRef.current?.cancelPending();
    if (!(await savePaths(null, false))) {
      dispatch({
        type: "operation-failed",
        message: "Open project stopped because current changes could not save.",
      });
      return;
    }

    const requestId = ++openRequestRef.current;
    const result = await api.openProject();
    if (requestId !== openRequestRef.current) {
      return;
    }
    if (!result.ok) {
      if (result.error.code !== "cancelled") {
        dispatch({
          type: "operation-failed",
          message: result.error.message,
        });
      }
      return;
    }

    const preferences = loadWorkspacePreferences(
      window.localStorage,
      result.value.projectId,
      result.value.autoBuild,
    );
    const availableFiles = new Set(
      result.value.entries
        .filter((entry) => entry.kind === "file")
        .map((entry) => entry.path),
    );
    const restoredPaths = [
      ...new Set(
        preferences.openPaths.filter((path) => availableFiles.has(path)),
      ),
    ].slice(0, 20);
    if (restoredPaths.length === 0) {
      const firstPath =
        result.value.rootFile ??
        result.value.rootCandidates[0]?.path ??
        result.value.entries.find((entry) => entry.kind === "file")?.path;
      if (firstPath !== undefined) {
        restoredPaths.push(firstPath);
      }
    }

    const fileResults = await Promise.all(
      restoredPaths.map((path) => api.readTextFile({ path })),
    );
    if (requestId !== openRequestRef.current) {
      return;
    }
    const files = fileResults.flatMap((fileResult) =>
      fileResult.ok ? [fileResult.value] : [],
    );
    const activePath =
      preferences.activePath !== null &&
      files.some((file) => file.path === preferences.activePath)
        ? preferences.activePath
        : (files[0]?.path ?? null);

    restoredProjectIdRef.current = result.value.projectId;
    dispatch({
      type: "project-opened",
      project: result.value,
      paneRatio: preferences.paneRatio,
      settings: preferences.settings,
    });
    dispatch({
      type: "files-restored",
      files,
      activePath,
      views: preferences.bufferViews,
    });
  };

  const requestCompile = async (revision: number): Promise<void> => {
    const rootFile = stateRef.current.project?.rootFile;
    if (rootFile === null || rootFile === undefined) {
      dispatch({
        type: "build-operation-failed",
        message: "No LaTeX root file was detected for this project.",
      });
      return;
    }

    const compiledContents = new Map(
      Object.values(stateRef.current.buffers).map((buffer) => [
        buffer.path,
        buffer.content,
      ]),
    );
    const result = await api.compileProject({ rootFile });
    const coordinator = coordinatorRef.current;
    if (coordinator === null || !coordinator.isCurrentRevision(revision)) {
      return;
    }
    if (!result.ok) {
      dispatch({
        type: "build-operation-failed",
        message: result.error.message,
      });
      return;
    }
    if (result.value.disposition !== "current") {
      return;
    }
    const sourceChanged = Object.values(stateRef.current.buffers).some(
      (buffer) => compiledContents.get(buffer.path) !== buffer.content,
    );
    if (sourceChanged) {
      return;
    }

    dispatch({ type: "build-finished", build: result.value });
    const artifact = result.value.visiblePdf;
    if (artifact === null) {
      return;
    }
    const loadedPdf = stateRef.current.pdf;
    if (
      loadedPdf !== null &&
      loadedPdf.artifact.buildId === artifact.buildId &&
      loadedPdf.artifact.generation === artifact.generation
    ) {
      return;
    }

    dispatch({ type: "pdf-loading" });
    const pdfResult = await api.loadPdf({
      buildId: artifact.buildId,
      generation: artifact.generation,
    });
    if (!coordinator.isCurrentRevision(revision)) {
      return;
    }
    if (pdfResult.ok) {
      dispatch({
        type: "pdf-loaded",
        artifact: pdfResult.value.artifact,
        data: pdfResult.value.data,
      });
    } else {
      dispatch({
        type: "build-operation-failed",
        message: pdfResult.error.message,
      });
    }
  };

  const performPdfAction = async (action: "open" | "reveal"): Promise<void> => {
    const artifact = stateRef.current.pdf?.artifact;
    if (artifact === undefined) {
      return;
    }
    const request = {
      buildId: artifact.buildId,
      generation: artifact.generation,
    };
    const result =
      action === "open"
        ? await api.openPdf(request)
        : await api.revealPdf(request);
    if (!result.ok) {
      dispatch({
        type: "build-operation-failed",
        message: result.error.message,
      });
    }
  };

  const navigateToDiagnostic = async (
    diagnostic: BuildDiagnostic,
  ): Promise<void> => {
    if (diagnostic.file === null || diagnostic.line === null) {
      return;
    }
    if (stateRef.current.buffers[diagnostic.file] === undefined) {
      dispatch({ type: "file-loading", path: diagnostic.file });
      const result = await api.readTextFile({ path: diagnostic.file });
      if (!result.ok) {
        dispatch({
          type: "operation-failed",
          message: result.error.message,
          path: diagnostic.file,
        });
        return;
      }
      dispatch({ type: "file-opened", file: result.value });
    }
    diagnosticRequestRef.current += 1;
    dispatch({
      type: "diagnostic-selected",
      diagnostic,
      requestId: diagnosticRequestRef.current,
    });
  };

  useEffect(() => {
    const coordinator = new LiveBuildCoordinator({
      save: () => savePaths(null, false),
      build: requestCompile,
      onPhaseChange: (phase) => {
        dispatch({ type: "build-phase-changed", phase });
      },
      onBuildBlocked: () => {
        dispatch({
          type: "build-operation-failed",
          message: "Compile stopped because the newest source could not save.",
        });
      },
      onUnexpectedError: (error) => {
        dispatch({
          type: "build-operation-failed",
          message:
            error instanceof Error
              ? error.message
              : "The live build workflow failed unexpectedly.",
        });
      },
    });
    coordinator.configure(stateRef.current.settings);
    coordinatorRef.current = coordinator;
    return () => {
      coordinator.dispose();
      coordinatorRef.current = null;
    };
  }, [api]);

  useEffect(() => {
    coordinatorRef.current?.configure(state.settings);
  }, [state.settings]);

  useEffect(
    () =>
      api.onProjectFileChanged((change) => {
        if (stateRef.current.project?.projectId !== change.projectId) {
          return;
        }
        const buffer = stateRef.current.buffers[change.path];
        const detail =
          change.kind === "deleted"
            ? "was deleted outside TeXPulse Studio"
            : "changed outside TeXPulse Studio";
        dispatch({
          type: "external-change-detected",
          message:
            buffer !== undefined && isBufferModified(buffer)
              ? `${change.path} ${detail}. Your unsaved editor content was preserved.`
              : `${change.path} ${detail}. Reopen the project to reload it.`,
        });
      }),
    [api],
  );

  useEffect(() => {
    const project = state.project;
    if (
      project === null ||
      restoredProjectIdRef.current !== project.projectId
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      persistWorkspaceState(window.localStorage, stateRef.current);
    }, 250);
    return () => {
      window.clearTimeout(timer);
    };
  }, [
    state.activePath,
    state.buffers,
    state.paneRatio,
    state.project,
    state.settings,
  ]);

  useEffect(() => {
    const persistBeforePageHide = () => {
      const current = stateRef.current;
      if (
        current.project !== null &&
        restoredProjectIdRef.current === current.project.projectId
      ) {
        persistWorkspaceState(window.localStorage, current);
      }
    };
    window.addEventListener("pagehide", persistBeforePageHide);
    window.addEventListener("beforeunload", persistBeforePageHide);
    return () => {
      window.removeEventListener("pagehide", persistBeforePageHide);
      window.removeEventListener("beforeunload", persistBeforePageHide);
    };
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const split = splitRef.current;
      if (!draggingSplitRef.current || split === null) {
        return;
      }
      const bounds = split.getBoundingClientRect();
      const paneRatio = Math.min(
        Math.max((event.clientX - bounds.left) / bounds.width, 0.3),
        0.75,
      );
      dispatch({ type: "pane-ratio-changed", paneRatio });
    };
    const handlePointerUp = () => {
      draggingSplitRef.current = false;
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  const updateSettings = (settings: Partial<LiveBuildSettings>): void => {
    dispatch({
      type: "settings-changed",
      settings: { ...stateRef.current.settings, ...settings },
    });
  };

  const projectTitle = state.project?.name ?? "No project open";
  const isAnyFileSaving = state.savingPaths.length > 0;
  const isSaving =
    activeBuffer !== undefined && state.savingPaths.includes(activeBuffer.path);
  const buildBusy = ["saving", "queued", "compiling", "loading-pdf"].includes(
    state.buildPhase,
  );
  const buildStatus =
    state.buildPhase === "debouncing"
      ? "Debouncing"
      : state.buildPhase === "saving"
        ? "Saving"
        : state.buildPhase === "queued"
          ? "Queued"
          : state.buildPhase === "compiling"
            ? "Compiling"
            : state.buildPhase === "loading-pdf"
              ? "Loading PDF"
              : (state.build?.status ?? "Idle");
  const statusClass =
    state.buildPhase === "idle"
      ? (state.build?.status ?? "idle")
      : state.buildPhase;
  const diagnostics = state.build?.diagnostics ?? [];
  const activeDiagnostics =
    activeBuffer === undefined
      ? []
      : diagnostics.filter(
          (diagnostic) => diagnostic.file === activeBuffer.path,
        );
  const bottomPanelOpen = state.logOpen || state.problemsOpen;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            T
          </span>
          <div>
            <p>TeXPulse Studio</p>
            <span>{projectTitle}</span>
          </div>
        </div>
        <div className="toolbar" aria-label="Editor actions">
          <button
            type="button"
            className="button secondary"
            disabled={state.build === null}
            onClick={() => {
              dispatch({ type: "problems-toggled" });
            }}
          >
            {state.problemsOpen
              ? "Hide problems"
              : `Problems (${String(diagnostics.length)})`}
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={buildBusy || isAnyFileSaving}
            onClick={openProject}
          >
            Open project
          </button>
          <button
            type="button"
            className="button"
            disabled={
              activeBuffer === undefined ||
              !isBufferModified(activeBuffer) ||
              isSaving
            }
            onClick={() => {
              if (activeBuffer !== undefined) {
                void savePaths([activeBuffer.path], true);
              }
            }}
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={modifiedPaths.size === 0 || isAnyFileSaving}
            onClick={() => {
              void savePaths(null, true);
            }}
          >
            Save all
          </button>
          <span className="toolbar-divider" aria-hidden="true" />
          <label className="setting-toggle">
            <input
              type="checkbox"
              checked={state.settings.autosave}
              onChange={(event) => {
                updateSettings({ autosave: event.currentTarget.checked });
              }}
            />
            Autosave
          </label>
          <label className="setting-toggle">
            <input
              type="checkbox"
              checked={state.settings.autoBuild}
              onChange={(event) => {
                updateSettings({ autoBuild: event.currentTarget.checked });
              }}
            />
            Auto build
          </label>
          <label className="debounce-setting">
            <span>Delay</span>
            <select
              aria-label="Automatic build delay"
              value={state.settings.debounceMs}
              onChange={(event) => {
                updateSettings({
                  debounceMs: Number(event.currentTarget.value),
                });
              }}
            >
              <option value={400}>400 ms</option>
              <option value={800}>800 ms</option>
              <option value={1200}>1.2 s</option>
              <option value={2000}>2 s</option>
            </select>
          </label>
          <span className="toolbar-divider" aria-hidden="true" />
          <button
            type="button"
            className="button compile"
            disabled={
              state.project?.rootFile === null ||
              state.project === null ||
              buildBusy
            }
            onClick={() => {
              void coordinatorRef.current?.manualBuild();
            }}
          >
            {buildBusy ? `${buildStatus}...` : "Compile"}
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={
              state.buildPhase !== "compiling" && state.buildPhase !== "queued"
            }
            onClick={() => {
              void api.cancelBuild().then((result) => {
                if (!result.ok) {
                  dispatch({
                    type: "build-operation-failed",
                    message: result.error.message,
                  });
                }
              });
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={state.build === null}
            onClick={() => {
              dispatch({ type: "log-toggled" });
            }}
          >
            {state.logOpen ? "Hide log" : "Show log"}
          </button>
        </div>
      </header>

      <div className="workspace">
        {state.project === null ? (
          <aside className="project-panel empty" aria-label="Project explorer">
            <p className="eyebrow">Project</p>
            <p>No folder open</p>
          </aside>
        ) : (
          <ProjectExplorer
            project={state.project}
            activePath={state.activePath}
            modifiedPaths={modifiedPaths}
            loadingPath={state.loadingPath}
            onOpenFile={(path) => {
              void openFile(path);
            }}
          />
        )}

        <div
          className={`main-workspace ${bottomPanelOpen ? "with-bottom-panel" : ""}`}
        >
          <div
            className="content-split"
            ref={splitRef}
            style={
              {
                "--editor-pane-percent": `${String(state.paneRatio * 100)}%`,
              } as CSSProperties
            }
          >
            <main className="editor-panel">
              {activeBuffer === undefined ? (
                <section className="welcome">
                  <div className="welcome-copy">
                    <p className="eyebrow">Local-first LaTeX workspace</p>
                    <h1>
                      Write, compile, and inspect without leaving your desk.
                    </h1>
                    <p>
                      Open a project, edit its source, then compile through your
                      local MiKTeX installation.
                    </p>
                    <button
                      type="button"
                      className="button large"
                      onClick={openProject}
                    >
                      Open a project
                    </button>
                  </div>
                </section>
              ) : (
                <>
                  <div className="editor-tabbar">
                    <div className="editor-tab" aria-current="page">
                      <span>{activeBuffer.path}</span>
                      {isBufferModified(activeBuffer) ? (
                        <span className="modified-dot" aria-label="Modified">
                          ●
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <Suspense
                    fallback={
                      <div className="editor-loading">Loading editor...</div>
                    }
                  >
                    <EditorPane
                      buffer={activeBuffer}
                      diagnostics={activeDiagnostics}
                      navigationTarget={state.diagnosticTarget}
                      onChange={(path, content) => {
                        dispatch({ type: "content-changed", path, content });
                        coordinatorRef.current?.noteEdit();
                      }}
                      onViewStateChange={(path, cursor, scrollTop) => {
                        dispatch({
                          type: "view-state-changed",
                          path,
                          cursor,
                          scrollTop,
                        });
                      }}
                    />
                  </Suspense>
                </>
              )}
            </main>

            <div
              className="pane-divider"
              role="separator"
              aria-label="Resize editor and PDF panes"
              aria-orientation="vertical"
              aria-valuemin={30}
              aria-valuemax={75}
              aria-valuenow={Math.round(state.paneRatio * 100)}
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
                  return;
                }
                event.preventDefault();
                const direction = event.key === "ArrowLeft" ? -0.02 : 0.02;
                dispatch({
                  type: "pane-ratio-changed",
                  paneRatio: Math.min(
                    Math.max(stateRef.current.paneRatio + direction, 0.3),
                    0.75,
                  ),
                });
              }}
              onPointerDown={(event) => {
                event.preventDefault();
                draggingSplitRef.current = true;
              }}
            />

            {state.pdf === null ? (
              <section className="preview-empty" aria-label="PDF preview">
                <div className="preview-mark" aria-hidden="true">
                  PDF
                </div>
                <strong>No completed PDF yet</strong>
                <span>
                  {state.project?.rootFile === null
                    ? "No LaTeX root file was detected."
                    : "Stop typing to save and refresh the preview."}
                </span>
              </section>
            ) : (
              <Suspense
                fallback={
                  <div className="preview-empty">Loading PDF viewer...</div>
                }
              >
                <PdfViewer
                  artifact={state.pdf.artifact}
                  data={state.pdf.data}
                  onOpen={() => {
                    void performPdfAction("open");
                  }}
                  onReveal={() => {
                    void performPdfAction("reveal");
                  }}
                />
              </Suspense>
            )}
          </div>
          {state.problemsOpen && state.build !== null ? (
            <ProblemsPanel
              diagnostics={diagnostics}
              onClose={() => {
                dispatch({ type: "problems-toggled" });
              }}
              onSelect={(diagnostic) => {
                void navigateToDiagnostic(diagnostic);
              }}
            />
          ) : state.logOpen && state.build !== null ? (
            <BuildLog
              build={state.build}
              onClose={() => {
                dispatch({ type: "log-toggled" });
              }}
            />
          ) : null}
        </div>
      </div>

      <footer className="statusbar">
        <span>{state.activePath ?? "Ready"}</span>
        <span className={`build-status status-${statusClass}`}>
          Build: {buildStatus}
        </span>
        <span>
          {modifiedPaths.size === 0
            ? "All changes saved"
            : `${String(modifiedPaths.size)} modified`}
        </span>
      </footer>

      {state.notice !== null ? (
        <div className="notice" role="status">
          <span>{state.notice}</span>
          <button
            type="button"
            aria-label="Dismiss message"
            onClick={() => {
              dispatch({ type: "notice-dismissed" });
            }}
          >
            x
          </button>
        </div>
      ) : null}
    </div>
  );
}
