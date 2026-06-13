import { lazy, Suspense, useMemo, useReducer } from "react";

import type { TeXPulseApi } from "../ipc/project-contracts.js";
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

interface AppProps {
  api?: TeXPulseApi;
}

export function App({ api = window.texpulse }: AppProps) {
  const [state, dispatch] = useReducer(workspaceReducer, initialWorkspaceState);
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

  const saveBuffers = async (buffers: EditorBuffer[]): Promise<void> => {
    if (buffers.length === 0) {
      return;
    }
    dispatch({
      type: "save-started",
      paths: buffers.map((buffer) => buffer.path),
    });

    await Promise.all(
      buffers.map(async (buffer) => {
        const result = await api.writeTextFile({
          path: buffer.path,
          content: buffer.content,
          expectedVersion: buffer.version,
        });
        if (result.ok) {
          dispatch({ type: "save-succeeded", file: result.value });
        } else {
          dispatch({
            type: "operation-failed",
            message: result.error.message,
            path: buffer.path,
          });
        }
      }),
    );
  };

  const projectTitle = state.project?.name ?? "No project open";
  const isAnyFileSaving = state.savingPaths.length > 0;
  const isSaving =
    activeBuffer !== undefined && state.savingPaths.includes(activeBuffer.path);

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
            {isSaving ? "Saving…" : "Save"}
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

        <main className="editor-panel">
          {activeBuffer === undefined ? (
            <section className="welcome">
              <div className="welcome-copy">
                <p className="eyebrow">Local-first LaTeX workspace</p>
                <h1>Write clearly. Keep every file yours.</h1>
                <p>
                  Open an existing project to browse and edit its source. Build
                  and PDF preview arrive in the next sprint.
                </p>
                <button
                  type="button"
                  className="button large"
                  onClick={openProject}
                >
                  Open a project
                </button>
              </div>
              <div className="welcome-card" aria-hidden="true">
                <span className="code-line short" />
                <span className="code-line long" />
                <span className="code-line medium amber" />
                <span className="code-line long" />
                <span className="code-line short" />
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
                fallback={<div className="editor-loading">Loading editor…</div>}
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
      </div>

      <footer className="statusbar">
        <span>{state.activePath ?? "Ready"}</span>
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
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}
