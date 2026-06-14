import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import type { TeXPulseApi } from "../ipc/api-contract.js";
import type { BuildDiagnostic } from "../ipc/build-contracts.js";
import { BuildLog } from "./components/BuildLog.js";
import { ProblemsPanel } from "./components/ProblemsPanel.js";
import { ProjectExplorer } from "./components/ProjectExplorer.js";
import { SettingsDialog } from "./components/SettingsDialog.js";
import { LiveBuildCoordinator } from "./live-build-coordinator.js";
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
import { defaultGlobalSettings } from "../settings/settings-types.js";
import type { GlobalSettings } from "../settings/settings-types.js";
import type {
  ProjectSettings,
  ToolchainReport,
} from "../ipc/settings-contracts.js";

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
  const synctexRequestRef = useRef(0);
  const [syncBusy, setSyncBusy] = useState(false);
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>(
    defaultGlobalSettings(),
  );
  const globalSettingsRef = useRef(globalSettings);
  const [settingsIssues, setSettingsIssues] = useState<string[]>([]);
  const [settingsMode, setSettingsMode] = useState<"settings" | "setup" | null>(
    null,
  );
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [toolchain, setToolchain] = useState<ToolchainReport | null>(null);
  stateRef.current = state;
  globalSettingsRef.current = globalSettings;

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
    synctexRequestRef.current += 1;
    setSyncBusy(false);
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
      settings: {
        autosave: globalSettingsRef.current.autosave,
        autoBuild: result.value.settings.autoBuild,
        debounceMs: globalSettingsRef.current.debounceMs,
      },
    });
    if (result.value.settingsIssues.length > 0) {
      setSettingsIssues((current) => [
        ...current,
        ...result.value.settingsIssues,
      ]);
      dispatch({
        type: "external-change-detected",
        message:
          "Project settings were recovered with safe defaults. Open Settings for details.",
      });
    }
    dispatch({
      type: "files-restored",
      files,
      activePath,
      views: preferences.bufferViews,
    });
  };

  const requestCompile = async (
    revision: number,
    clean = false,
  ): Promise<void> => {
    synctexRequestRef.current += 1;
    setSyncBusy(false);
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
    const result = clean
      ? await api.cleanBuild({ rootFile })
      : await api.compileProject({ rootFile });
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

  const forwardSearch = async (): Promise<void> => {
    const current = stateRef.current;
    const buffer =
      current.activePath === null
        ? undefined
        : current.buffers[current.activePath];
    const artifact = current.pdf?.artifact;
    if (buffer === undefined || artifact === undefined) {
      return;
    }
    if (!artifact.isCurrent) {
      dispatch({
        type: "build-operation-failed",
        message: "Compile the current source before using forward search.",
      });
      return;
    }
    const requestId = ++synctexRequestRef.current;
    const position = sourcePosition(buffer.content, buffer.cursor);
    setSyncBusy(true);
    const result = await api.forwardSync({
      buildId: artifact.buildId,
      generation: artifact.generation,
      path: buffer.path,
      line: position.line,
      column: position.column,
    });
    setSyncBusy(false);
    if (
      requestId !== synctexRequestRef.current ||
      !isCurrentArtifact(stateRef.current, artifact)
    ) {
      return;
    }
    if (result.ok) {
      dispatch({
        type: "sync-forward-selected",
        target: result.value,
        requestId,
      });
    } else {
      dispatch({
        type: "build-operation-failed",
        message: result.error.message,
      });
    }
  };

  const inverseSearch = async (
    page: number,
    x: number,
    y: number,
  ): Promise<void> => {
    const artifact = stateRef.current.pdf?.artifact;
    if (artifact === undefined) {
      return;
    }
    if (!artifact.isCurrent) {
      dispatch({
        type: "build-operation-failed",
        message: "Compile the current source before using inverse search.",
      });
      return;
    }
    const requestId = ++synctexRequestRef.current;
    setSyncBusy(true);
    const result = await api.inverseSync({
      buildId: artifact.buildId,
      generation: artifact.generation,
      page,
      x,
      y,
    });
    setSyncBusy(false);
    if (
      requestId !== synctexRequestRef.current ||
      !isCurrentArtifact(stateRef.current, artifact)
    ) {
      return;
    }
    if (!result.ok) {
      dispatch({
        type: "build-operation-failed",
        message: result.error.message,
      });
      return;
    }
    if (stateRef.current.buffers[result.value.path] === undefined) {
      dispatch({ type: "file-loading", path: result.value.path });
      const fileResult = await api.readTextFile({ path: result.value.path });
      if (
        requestId !== synctexRequestRef.current ||
        !isCurrentArtifact(stateRef.current, artifact)
      ) {
        return;
      }
      if (!fileResult.ok) {
        dispatch({
          type: "operation-failed",
          message: fileResult.error.message,
          path: result.value.path,
        });
        return;
      }
      dispatch({ type: "file-opened", file: fileResult.value });
    }
    dispatch({
      type: "sync-inverse-selected",
      path: result.value.path,
      line: result.value.line,
      column: result.value.column,
      requestId,
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
    let disposed = false;
    void api.getSettings().then((result) => {
      if (disposed) {
        return;
      }
      if (!result.ok) {
        dispatch({
          type: "operation-failed",
          message: result.error.message,
        });
        return;
      }
      setGlobalSettings(result.value.settings);
      setSettingsIssues(result.value.issues);
      dispatch({
        type: "settings-changed",
        settings: {
          autosave: result.value.settings.autosave,
          autoBuild:
            stateRef.current.project?.settings.autoBuild ??
            result.value.settings.autoBuild,
          debounceMs: result.value.settings.debounceMs,
        },
      });
      if (!result.value.settings.setupCompleted) {
        setSettingsMode("setup");
      }
    });
    return () => {
      disposed = true;
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

  const checkToolchain = async (
    customBinDirectory: string | null,
    skipSelfTest = false,
  ): Promise<void> => {
    setSettingsBusy(true);
    const result = await api.checkToolchain({
      customBinDirectory,
      ...(skipSelfTest ? { skipSelfTest: true } : {}),
    });
    setSettingsBusy(false);
    if (result.ok) {
      setToolchain(result.value);
    } else {
      dispatch({
        type: "operation-failed",
        message: result.error.message,
      });
    }
  };

  const saveSettings = async (
    requestedGlobal: GlobalSettings,
    requestedProject: ProjectSettings | null,
  ): Promise<void> => {
    setSettingsBusy(true);
    const globalResult = await api.saveGlobalSettings({
      ...requestedGlobal,
      setupCompleted:
        settingsMode === "setup" ? true : requestedGlobal.setupCompleted,
    });
    if (!globalResult.ok) {
      setSettingsBusy(false);
      dispatch({
        type: "operation-failed",
        message: globalResult.error.message,
      });
      return;
    }
    if (requestedProject !== null) {
      const projectResult = await api.saveProjectSettings(requestedProject);
      if (!projectResult.ok) {
        setSettingsBusy(false);
        dispatch({
          type: "operation-failed",
          message: projectResult.error.message,
        });
        return;
      }
      dispatch({
        type: "project-settings-changed",
        settings: projectResult.value,
      });
    }
    setGlobalSettings(globalResult.value);
    setSettingsIssues([]);
    dispatch({
      type: "settings-changed",
      settings: {
        autosave: globalResult.value.autosave,
        autoBuild:
          requestedProject?.autoBuild ??
          stateRef.current.project?.settings.autoBuild ??
          globalResult.value.autoBuild,
        debounceMs: globalResult.value.debounceMs,
      },
    });
    setSettingsBusy(false);
    setSettingsMode(null);
    dispatch({
      type: "external-change-detected",
      message: "Settings saved.",
    });
  };

  const cleanBuild = async (): Promise<void> => {
    const coordinator = coordinatorRef.current;
    if (coordinator === null || !(await savePaths(null, false))) {
      return;
    }
    setSettingsMode(null);
    await requestCompile(coordinator.currentRevision(), true);
  };

  const cleanupAuxiliary = async (): Promise<void> => {
    setSettingsBusy(true);
    const result = await api.cleanupAuxiliary();
    setSettingsBusy(false);
    if (result.ok) {
      dispatch({
        type: "external-change-detected",
        message: `Removed ${String(result.value.removedFiles)} auxiliary files.`,
      });
    } else {
      dispatch({
        type: "operation-failed",
        message: result.error.message,
      });
    }
  };

  const updateGlobalQuick = (changes: Partial<GlobalSettings>): void => {
    const settings = { ...globalSettingsRef.current, ...changes };
    setGlobalSettings(settings);
    dispatch({
      type: "settings-changed",
      settings: {
        ...stateRef.current.settings,
        autosave: settings.autosave,
        debounceMs: settings.debounceMs,
      },
    });
    void api.saveGlobalSettings(settings).then((result) => {
      if (!result.ok) {
        dispatch({
          type: "operation-failed",
          message: result.error.message,
        });
      }
    });
  };

  const updateProjectAutoBuild = (autoBuild: boolean): void => {
    const settings = stateRef.current.project?.settings;
    if (settings === undefined) {
      return;
    }
    const updated = { ...settings, autoBuild };
    dispatch({ type: "project-settings-changed", settings: updated });
    void api.saveProjectSettings(updated).then((result) => {
      if (!result.ok) {
        dispatch({
          type: "operation-failed",
          message: result.error.message,
        });
      }
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
            className="button secondary"
            onClick={() => {
              setSettingsMode("settings");
            }}
          >
            Settings
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
                updateGlobalQuick({ autosave: event.currentTarget.checked });
              }}
            />
            Autosave
          </label>
          <label className="setting-toggle">
            <input
              type="checkbox"
              checked={state.settings.autoBuild}
              disabled={state.project === null}
              onChange={(event) => {
                updateProjectAutoBuild(event.currentTarget.checked);
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
                updateGlobalQuick({
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
                    <button
                      type="button"
                      className="editor-sync-button"
                      disabled={
                        syncBusy ||
                        state.pdf === null ||
                        !state.pdf.artifact.isCurrent
                      }
                      onClick={() => {
                        void forwardSearch();
                      }}
                    >
                      Forward search
                    </button>
                  </div>
                  <Suspense
                    fallback={
                      <div className="editor-loading">Loading editor...</div>
                    }
                  >
                    <EditorPane
                      buffer={activeBuffer}
                      diagnostics={activeDiagnostics}
                      fontSize={globalSettings.editorFontSize}
                      navigationTarget={state.navigationTarget}
                      onChange={(path, content) => {
                        synctexRequestRef.current += 1;
                        setSyncBusy(false);
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
                  defaultZoomMode={globalSettings.pdfZoomMode}
                  syncTarget={state.pdfSyncTarget}
                  onOpen={() => {
                    void performPdfAction("open");
                  }}
                  onReveal={() => {
                    void performPdfAction("reveal");
                  }}
                  onInverseSearch={(page, x, y) => {
                    void inverseSearch(page, x, y);
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

      {settingsMode !== null ? (
        <SettingsDialog
          busy={settingsBusy}
          globalSettings={globalSettings}
          issues={[...settingsIssues, ...(state.project?.settingsIssues ?? [])]}
          mode={settingsMode}
          projectSettings={state.project?.settings ?? null}
          rootOptions={
            state.project?.entries
              .filter(
                (entry) =>
                  entry.kind === "file" &&
                  entry.path.toLowerCase().endsWith(".tex"),
              )
              .map((entry) => entry.path) ?? []
          }
          toolchain={toolchain}
          onCheckToolchain={(customBinDirectory) => {
            void checkToolchain(customBinDirectory);
          }}
          onCleanBuild={() => {
            void cleanBuild();
          }}
          onCleanupAuxiliary={() => {
            void cleanupAuxiliary();
          }}
          onClose={() => {
            setSettingsMode(null);
          }}
          onSave={(requestedGlobal, requestedProject) => {
            void saveSettings(requestedGlobal, requestedProject);
          }}
          onSkipSetup={(requestedGlobal, requestedProject) => {
            void checkToolchain(requestedGlobal.customBinDirectory, true).then(
              () => saveSettings(requestedGlobal, requestedProject),
            );
          }}
        />
      ) : null}
    </div>
  );
}

function sourcePosition(
  content: string,
  cursor: number,
): { line: number; column: number } {
  const boundedCursor = Math.min(Math.max(cursor, 0), content.length);
  const lines = content.slice(0, boundedCursor).split("\n");
  return {
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
  };
}

function isCurrentArtifact(
  state: WorkspaceState,
  expected: { buildId: string; generation: number },
): boolean {
  const artifact = state.pdf?.artifact;
  return (
    artifact?.isCurrent === true &&
    artifact.buildId === expected.buildId &&
    artifact.generation === expected.generation
  );
}
