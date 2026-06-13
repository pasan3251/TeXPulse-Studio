import { lazy, Suspense, useMemo, useReducer, useRef } from "react";

import type { TeXPulseApi } from "../ipc/api-contract.js";
import { BuildLog } from "./components/BuildLog.js";
import { ProjectExplorer } from "./components/ProjectExplorer.js";
import {
  initialWorkspaceState,
  isBufferModified,
  workspaceReducer,
  type EditorBuffer,
} from "./workspace-state.js";

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

export function App({ api = window.texpulse }: AppProps) {
  const [state, dispatch] = useReducer(workspaceReducer, initialWorkspaceState);
  const stateRef = useRef(state);
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
    if (state.buffers[path] !== undefined) {
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

  const openProject = async (): Promise<void> => {
    const result = await api.openProject();
    if (!result.ok) {
      if (result.error.code !== "cancelled") {
        dispatch({
          type: "operation-failed",
          message: result.error.message,
        });
      }
      return;
    }

    dispatch({ type: "project-opened", project: result.value });
    const firstPath =
      result.value.rootCandidates[0]?.path ??
      result.value.entries.find((entry) => entry.kind === "file")?.path;
    if (firstPath !== undefined) {
      dispatch({ type: "file-loading", path: firstPath });
      const fileResult = await api.readTextFile({ path: firstPath });
      if (fileResult.ok) {
        dispatch({ type: "file-opened", file: fileResult.value });
      } else {
        dispatch({
          type: "operation-failed",
          message: fileResult.error.message,
          path: firstPath,
        });
      }
    }
  };

  const saveBuffers = async (buffers: EditorBuffer[]): Promise<boolean> => {
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
          dispatch({ type: "save-succeeded", file: result.value });
          return {
            ok: true as const,
            path: buffer.path,
            savedContent: result.value.content,
          };
        } else {
          dispatch({
            type: "operation-failed",
            message: result.error.message,
            path: buffer.path,
          });
          return { ok: false as const };
        }
      }),
    );
    if (results.some((result) => !result.ok)) {
      return false;
    }
    return results.every((result) => {
      if (!result.ok) {
        return false;
      }
      return (
        stateRef.current.buffers[result.path]?.content === result.savedContent
      );
    });
  };

  const compileProject = async (): Promise<void> => {
    const rootFile = state.project?.rootFile;
    if (rootFile === null || rootFile === undefined) {
      dispatch({
        type: "build-operation-failed",
        message: "No LaTeX root file was detected for this project.",
      });
      return;
    }

    dispatch({ type: "build-started" });
    const buffersToSave = Object.values(stateRef.current.buffers).filter(
      isBufferModified,
    );
    const saved = await saveBuffers(buffersToSave);
    if (!saved) {
      dispatch({
        type: "build-operation-failed",
        message:
          "Compile stopped because a save failed or the file changed while saving.",
      });
      return;
    }

    dispatch({ type: "build-compiling" });
    const compiledContents = new Map(
      Object.values(stateRef.current.buffers).map((buffer) => [
        buffer.path,
        buffer.content,
      ]),
    );
    const result = await api.compileProject({ rootFile });
    if (!result.ok) {
      dispatch({
        type: "build-operation-failed",
        message: result.error.message,
      });
      return;
    }

    const sourceChanged = Object.values(stateRef.current.buffers).some(
      (buffer) => compiledContents.get(buffer.path) !== buffer.content,
    );
    const build =
      sourceChanged && result.value.visiblePdf !== null
        ? {
            ...result.value,
            visiblePdf: { ...result.value.visiblePdf, isCurrent: false },
          }
        : result.value;
    dispatch({ type: "build-finished", build });
    const artifact = build.visiblePdf;
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
    if (pdfResult.ok) {
      dispatch({
        type: "pdf-loaded",
        artifact,
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
    const artifact = state.pdf?.artifact;
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

  const projectTitle = state.project?.name ?? "No project open";
  const isAnyFileSaving = state.savingPaths.length > 0;
  const isSaving =
    activeBuffer !== undefined && state.savingPaths.includes(activeBuffer.path);
  const buildBusy = state.buildPhase !== "idle";
  const buildStatus =
    state.buildPhase === "saving"
      ? "Saving before build"
      : state.buildPhase === "compiling"
        ? "Compiling"
        : state.buildPhase === "loading-pdf"
          ? "Loading PDF"
          : (state.build?.status ?? "Idle");

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
            disabled={buildBusy}
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
                void saveBuffers([activeBuffer]);
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
              void saveBuffers(
                Object.values(state.buffers).filter(isBufferModified),
              );
            }}
          >
            Save all
          </button>
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
              void compileProject();
            }}
          >
            {buildBusy ? `${buildStatus}...` : "Compile"}
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={state.buildPhase !== "compiling"}
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

        <div className={`main-workspace ${state.logOpen ? "with-log" : ""}`}>
          <div className="content-split">
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
                      onChange={(path, content) => {
                        dispatch({ type: "content-changed", path, content });
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

            {state.pdf === null ? (
              <section className="preview-empty" aria-label="PDF preview">
                <div className="preview-mark" aria-hidden="true">
                  PDF
                </div>
                <strong>No completed PDF yet</strong>
                <span>
                  {state.project?.rootFile === null
                    ? "No LaTeX root file was detected."
                    : "Compile the selected root to create the preview."}
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
          {state.logOpen && state.build !== null ? (
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
        <span
          className={`build-status status-${state.build?.status ?? "idle"}`}
        >
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
