import {
  rankRootCandidates,
  type CompileResultPayload,
  type CompileStatus,
  type DiagnosticCategory,
  type DiagnosticItem,
  type EditorDiagnostic,
  type EditorViewMode,
  type ForwardSyncTarget,
  type InverseSyncTarget,
  type OutlineHeading,
  type PackageSuggestionAction,
  type ProjectFile,
  type RecoverySnapshotPayload,
  type ThemeMode,
} from "@texpulse/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DiagnosticsDrawer } from "./components/DiagnosticsDrawer.js";
import {
  LatexEditorPane,
  type EditorNavigationTarget,
  type EditorSnapshotPayload,
} from "./components/LatexEditorPane.js";
import { PdfView } from "./components/PdfView.js";
import { SidebarPane } from "./components/SidebarPane.js";
import { VisualReadingPane } from "./components/VisualReadingPane.js";
import {
  DEFAULT_PROJECT_FILES,
  DEFAULT_PROJECT_NAME,
} from "./data/defaultProject.js";
import {
  buildMergedDiagnosticsView,
  insertPackageIntoPreamble,
} from "./editor/diagnostics-merge.js";
import { DocumentContextProvider } from "./services/DocumentContext.js";
import { buildProjectSymbolIndex } from "./services/WorkspaceIndexer.js";

const THEME_STORAGE_KEY = "texpulse.theme";
const RECOVERY_STORAGE_KEY = "texpulse.recovery.v1";

function loadPersistedTheme(): ThemeMode {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    return saved === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function loadLocalRecoverySnapshot(): RecoverySnapshotPayload | null {
  try {
    const raw = window.localStorage.getItem(RECOVERY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RecoverySnapshotPayload>;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.buffers)) {
      return null;
    }
    return {
      schemaVersion: 1,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date().toISOString(),
      activeFilePath:
        typeof parsed.activeFilePath === "string" ? parsed.activeFilePath : "main.tex",
      buffers: parsed.buffers,
    };
  } catch {
    return null;
  }
}

function saveLocalRecoverySnapshot(snapshot: RecoverySnapshotPayload | null): void {
  try {
    if (snapshot === null || snapshot.buffers.length === 0) {
      window.localStorage.removeItem(RECOVERY_STORAGE_KEY);
    } else {
      window.localStorage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(snapshot));
    }
  } catch {
    // Ignore storage quota errors
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function formatIssueCounts(errors: number, warnings: number): string {
  const parts: string[] = [];
  if (errors > 0) {
    parts.push(`${String(errors)} ${errors === 1 ? "Error" : "Errors"}`);
  }
  if (warnings > 0) {
    parts.push(`${String(warnings)} ${warnings === 1 ? "Warning" : "Warnings"}`);
  }
  return parts.join(" · ");
}

export function App() {
  const [theme, setTheme] = useState<ThemeMode>(loadPersistedTheme);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pdfPaneOpen, setPdfPaneOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DiagnosticCategory>("error");
  const [viewMode, setViewMode] = useState<EditorViewMode>("code");

  const [projectName, setProjectName] = useState(DEFAULT_PROJECT_NAME);
  const [projectRoot, setProjectRoot] = useState(".texpulse-workspace");
  const [files, setFiles] = useState<ProjectFile[]>(() =>
    DEFAULT_PROJECT_FILES.map((file) => ({ ...file })),
  );
  const [activeFilePath, setActiveFilePath] = useState("main.tex");
  const [dirtyPaths, setDirtyPaths] = useState<Set<string>>(() => new Set());
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved" | "recovered">(
    "saved",
  );
  const [workspaceHydrated, setWorkspaceHydrated] = useState(false);

  const [astDiagnostics, setAstDiagnostics] = useState<EditorDiagnostic[]>([]);
  const [compilerDiagnostics, setCompilerDiagnostics] = useState<readonly DiagnosticItem[]>(
    [],
  );
  const [outline, setOutline] = useState<OutlineHeading[]>([]);
  const [cursorMetrics, setCursorMetrics] = useState({
    line: 1,
    column: 1,
    section: null as string | null,
    env: null as string | null,
    astNodes: 0,
  });

  const [compiling, setCompiling] = useState(false);
  const [lastBuild, setLastBuild] = useState<CompileResultPayload | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [syncTarget, setSyncTarget] = useState<ForwardSyncTarget | null>(null);
  const [syncStatusMessage, setSyncStatusMessage] = useState<string | null>(null);
  const [navigationTarget, setNavigationTarget] =
    useState<EditorNavigationTarget | null>(null);

  const filesRef = useRef(files);
  filesRef.current = files;

  const dirtyPathsRef = useRef(dirtyPaths);
  dirtyPathsRef.current = dirtyPaths;

  const activeFilePathRef = useRef(activeFilePath);
  activeFilePathRef.current = activeFilePath;

  const cursorMetricsRef = useRef(cursorMetrics);
  cursorMetricsRef.current = cursorMetrics;

  const activeFile = useMemo(
    () => files.find((f) => f.path === activeFilePath) ?? files[0]!,
    [activeFilePath, files],
  );

  const rootFilePath = useMemo(() => {
    const ranked = rankRootCandidates(
      files.map((f) => ({ path: f.path, content: f.content })),
    );
    return ranked[0]?.path ?? "main.tex";
  }, [files]);

  const symbolIndex = useMemo(() => buildProjectSymbolIndex(files), [files]);

  const mergedDiagnostics = useMemo(
    () =>
      buildMergedDiagnosticsView({
        activeFilePath: activeFile.path,
        activeDocText: activeFile.content,
        astDiagnostics,
        compilerDiagnostics,
      }),
    [activeFile.content, activeFile.path, astDiagnostics, compilerDiagnostics],
  );

  const contextProviderRef = useRef<DocumentContextProvider>(
    new DocumentContextProvider({
      filePath: activeFile.path,
      docText: activeFile.content,
      cursorOffset: 0,
      selectedText: "",
      syntaxTree: null,
      projectSymbols: symbolIndex,
      diagnostics: mergedDiagnostics.contextDiagnostics,
      activeMathBlock: null,
    }),
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage quota errors
    }
  }, [theme]);

  useEffect(() => {
    (
      window as unknown as {
        __TEXPULSE_DOCUMENT_CONTEXT__?: DocumentContextProvider;
      }
    ).__TEXPULSE_DOCUMENT_CONTEXT__ = contextProviderRef.current;
  }, []);

  // Keep IDocumentContextProvider.getDiagnostics() synced cleanly after compiles & lints
  useEffect(() => {
    const scope = contextProviderRef.current.getCursorScope();
    const ast = contextProviderRef.current.getSyntaxTree();
    contextProviderRef.current.update({
      filePath: activeFile.path,
      docText: activeFile.content,
      cursorOffset: scope.offset,
      selectedText: scope.selectedText,
      syntaxTree: (ast.rawTree as EditorSnapshotPayload["syntaxTree"] | null) ?? null,
      projectSymbols: symbolIndex,
      diagnostics: mergedDiagnostics.contextDiagnostics,
      activeMathBlock: scope.activeMathBlock,
    });
  }, [activeFile.content, activeFile.path, mergedDiagnostics.contextDiagnostics, symbolIndex]);

  // Initial load from local server workspace + crash recovery overlay
  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      try {
        const res = await fetch("/api/project");
        if (!res.ok) return;
        const json = (await res.json()) as {
          ok?: boolean;
          projectRoot?: string;
          projectName?: string;
          files?: ProjectFile[];
          recovery?: RecoverySnapshotPayload | null;
        };
        if (cancelled || !json.ok || !Array.isArray(json.files) || json.files.length === 0) {
          return;
        }

        if (json.projectRoot) setProjectRoot(json.projectRoot);
        if (json.projectName && json.projectName !== ".texpulse-workspace") {
          setProjectName(json.projectName);
        }

        const diskFiles = json.files;
        const localRec = loadLocalRecoverySnapshot();
        const serverRec = json.recovery ?? null;
        const chosenRec =
          localRec &&
          (!serverRec || Date.parse(localRec.savedAt) >= Date.parse(serverRec.savedAt))
            ? localRec
            : serverRec;

        const recoveredDirty = new Set<string>();
        const hydratedFiles = diskFiles.map((file) => {
          const recMatch = chosenRec?.buffers.find((b) => b.path === file.path);
          if (recMatch && recMatch.content !== file.content) {
            recoveredDirty.add(file.path);
            return {
              ...file,
              content: recMatch.content,
              lastModified: recMatch.lastModified,
            };
          }
          return file;
        });

        setFiles(hydratedFiles);
        filesRef.current = hydratedFiles;

        const ranked = rankRootCandidates(
          hydratedFiles.map((f) => ({ path: f.path, content: f.content })),
        );
        const preferredActive =
          chosenRec?.activeFilePath &&
          hydratedFiles.some((f) => f.path === chosenRec.activeFilePath)
            ? chosenRec.activeFilePath
            : ranked[0]?.path ?? hydratedFiles[0]!.path;
        setActiveFilePath(preferredActive);

        if (recoveredDirty.size > 0) {
          setDirtyPaths(recoveredDirty);
          setSaveState("recovered");
        } else {
          saveLocalRecoverySnapshot(null);
          setSaveState("saved");
        }
      } catch {
        // Offline / Vite-only fallback keeps local recovery buffers if any
        const localRec = loadLocalRecoverySnapshot();
        if (localRec && localRec.buffers.length > 0) {
          setFiles((prev) =>
            prev.map((file) => {
              const hit = localRec.buffers.find((b) => b.path === file.path);
              return hit ? { ...file, content: hit.content, lastModified: hit.lastModified } : file;
            }),
          );
          setDirtyPaths(new Set(localRec.buffers.map((b) => b.path)));
          setSaveState("recovered");
        }
      } finally {
        if (!cancelled) {
          setWorkspaceHydrated(true);
        }
      }
    };
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  // Immediate local recovery + debounced (600ms) atomic disk autosave
  useEffect(() => {
    if (!workspaceHydrated || dirtyPaths.size === 0) return;

    const dirtyBuffers = files
      .filter((f) => dirtyPaths.has(f.path))
      .map((f) => ({
        path: f.path,
        content: f.content,
        lastModified: f.lastModified,
      }));

    saveLocalRecoverySnapshot({
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      activeFilePath,
      buffers: dirtyBuffers,
    });

    const timer = window.setTimeout(() => {
      void (async () => {
        setSaveState("saving");
        try {
          const res = await fetch("/api/project/autosave", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              files: dirtyBuffers.map((b) => ({ path: b.path, content: b.content })),
            }),
          });
          if (!res.ok) {
            setSaveState("unsaved");
            return;
          }
          setDirtyPaths((current) => {
            const next = new Set(current);
            for (const buf of dirtyBuffers) {
              const latest = filesRef.current.find((f) => f.path === buf.path);
              if (latest && latest.content === buf.content) {
                next.delete(buf.path);
              }
            }
            if (next.size === 0) {
              saveLocalRecoverySnapshot(null);
              setSaveState("saved");
            }
            return next;
          });
        } catch {
          setSaveState("unsaved");
        }
      })();
    }, 600);

    return () => window.clearTimeout(timer);
  }, [activeFilePath, dirtyPaths, files, workspaceHydrated]);

  // Flush dirty buffers to server recovery snapshot before page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      const currentDirty = dirtyPathsRef.current;
      if (currentDirty.size === 0) return;
      const dirtyBuffers = filesRef.current
        .filter((f) => currentDirty.has(f.path))
        .map((f) => ({
          path: f.path,
          content: f.content,
          lastModified: f.lastModified,
        }));
      const payload: RecoverySnapshotPayload = {
        schemaVersion: 1,
        savedAt: new Date().toISOString(),
        activeFilePath: activeFilePathRef.current,
        buffers: dirtyBuffers,
      };
      saveLocalRecoverySnapshot(payload);
      if (typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon(
          "/api/recovery",
          new Blob([JSON.stringify(payload)], { type: "application/json" }),
        );
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const handleContentChange = useCallback((path: string, nextContent: string) => {
    setFiles((prev) => {
      const updated = prev.map((file) =>
        file.path === path
          ? { ...file, content: nextContent, lastModified: Date.now() }
          : file,
      );
      filesRef.current = updated;
      return updated;
    });
    setDirtyPaths((prev) => {
      if (prev.has(path)) return prev;
      const next = new Set(prev);
      next.add(path);
      return next;
    });
    setSaveState("unsaved");
  }, []);

  const handleSnapshotUpdate = useCallback(
    (payload: EditorSnapshotPayload) => {
      setOutline(payload.outline);
      contextProviderRef.current.update({
        filePath: activeFile.path,
        docText: payload.docText,
        cursorOffset: payload.cursorOffset,
        selectedText: payload.selectedText,
        syntaxTree: payload.syntaxTree,
        projectSymbols: symbolIndex,
        diagnostics: mergedDiagnostics.contextDiagnostics,
        activeMathBlock: payload.activeMathBlock,
      });

      const scope = contextProviderRef.current.getCursorScope();
      const ast = contextProviderRef.current.getSyntaxTree();
      setCursorMetrics({
        line: scope.line,
        column: scope.column,
        section: scope.currentSection,
        env: scope.activeEnvironment,
        astNodes: ast.nodeCount,
      });
    },
    [activeFile.path, mergedDiagnostics.contextDiagnostics, symbolIndex],
  );

  const handleDiagnosticsUpdate = useCallback((nextDiagnostics: EditorDiagnostic[]) => {
    setAstDiagnostics(nextDiagnostics);
  }, []);

  const triggerCompile = useCallback(
    async (forceFullBuild = false, overrideFiles?: readonly ProjectFile[]) => {
      const payloadFiles = overrideFiles ?? filesRef.current;
      const rankedRoot =
        rankRootCandidates(
          payloadFiles.map((f) => ({ path: f.path, content: f.content })),
        )[0]?.path ?? "main.tex";

      setCompiling(true);
      setSyncStatusMessage(null);
      try {
        const response = await fetch("/api/compile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rootFile: rankedRoot,
            engine: "pdflatex",
            forceFullBuild,
            files: payloadFiles.map((f) => ({ path: f.path, content: f.content })),
          }),
        });
        const json = (await response.json()) as {
          ok: boolean;
          result?: CompileResultPayload;
          error?: string;
        };
        if (!json.ok || json.result === undefined) {
          throw new Error(json.error ?? "Backend compile request failed.");
        }

        const result = json.result;
        const settledDiagnostics = Array.isArray(result.diagnostics)
          ? result.diagnostics
          : [];
        setLastBuild(result);
        setCompilerDiagnostics(settledDiagnostics);

        setDirtyPaths(new Set());
        saveLocalRecoverySnapshot(null);
        setSaveState("saved");

        const hasErrors =
          result.status === "failed" ||
          settledDiagnostics.some((d) => d.category === "error");
        if (hasErrors) {
          setDrawerTab("error");
          setDrawerOpen(true);
        }

        if (result.status === "succeeded" && result.pdfAvailable) {
          const pdfRes = await fetch(
            `/api/pdf?rootFile=${encodeURIComponent(rankedRoot)}&buildId=${encodeURIComponent(result.buildId)}`,
          );
          if (pdfRes.ok) {
            const buf = await pdfRes.arrayBuffer();
            setPdfBytes(new Uint8Array(buf));
          }
        }
      } catch (err) {
        setLastBuild({
          buildId: "offline",
          status: "failed",
          tier: "tier3-latexmk",
          engine: "pdflatex",
          durationMs: 0,
          preambleHash: "",
          preambleCacheHit: false,
          pdfAvailable: false,
          synctexAvailable: false,
          logText: "",
          blgText: "",
          diagnostics: [],
          failureReason:
            err instanceof Error ? err.message : "Unable to reach compiler server.",
          completedAt: new Date().toISOString(),
        });
        setDrawerTab("error");
        setDrawerOpen(true);
      } finally {
        setCompiling(false);
      }
    },
    [],
  );

  const handleCompileTrigger = useCallback(() => {
    void triggerCompile(false);
  }, [triggerCompile]);

  const handleCancelCompile = useCallback(async () => {
    await fetch("/api/compile/cancel", { method: "POST" }).catch(() => undefined);
  }, []);

  const handleApplyPackageQuickFix = useCallback(
    (action: PackageSuggestionAction) => {
      if (action.type !== "insert-package") return;
      const targetRoot = rootFilePath;
      const currentFiles = filesRef.current;
      const updatedFiles = currentFiles.map((file) => {
        if (file.path !== targetRoot) return file;
        return {
          ...file,
          content: insertPackageIntoPreamble(file.content, action.packageName),
          lastModified: Date.now(),
        };
      });
      filesRef.current = updatedFiles;
      setFiles(updatedFiles);
      setDirtyPaths(new Set([targetRoot]));
      void triggerCompile(false, updatedFiles);
    },
    [rootFilePath, triggerCompile],
  );

  const handleSelectDiagnostic = useCallback((item: DiagnosticItem) => {
    if (filesRef.current.some((f) => f.path === item.file)) {
      setActiveFilePath(item.file);
    }
    setViewMode("code");
    setNavigationTarget({
      filePath: item.file,
      line: item.line,
      column: item.column ?? 1,
      nonce: Date.now(),
    });
  }, []);

  const handleExportZip = useCallback(() => {
    void (async () => {
      const response = await fetch("/api/project/export-zip");
      if (!response.ok) return;
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${projectName || "texpulse-project"}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    })();
  }, [projectName]);

  const handleImportZip = useCallback((zipFile: File) => {
    void (async () => {
      const buffer = new Uint8Array(await zipFile.arrayBuffer());
      const response = await fetch("/api/project/import-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          archiveBase64: bytesToBase64(buffer),
          filename: zipFile.name,
        }),
      });
      if (!response.ok) return;
      const json = (await response.json()) as {
        ok?: boolean;
        files?: ProjectFile[];
      };
      if (!json.ok || !Array.isArray(json.files) || json.files.length === 0) return;

      setFiles(json.files);
      filesRef.current = json.files;
      setDirtyPaths(new Set());
      saveLocalRecoverySnapshot(null);
      setSaveState("saved");
      setCompilerDiagnostics([]);
      setLastBuild(null);
      setPdfBytes(null);
      setSyncTarget(null);

      const bestRoot =
        rankRootCandidates(json.files.map((f) => ({ path: f.path, content: f.content })))[0]
          ?.path ?? json.files[0]!.path;
      setActiveFilePath(bestRoot);
    })();
  }, []);

  const handleOpenFolder = useCallback((directoryPath: string) => {
    void (async () => {
      const response = await fetch("/api/project/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directory: directoryPath }),
      });
      const json = (await response.json()) as {
        ok?: boolean;
        projectRoot?: string;
        projectName?: string;
        files?: ProjectFile[];
        error?: string;
      };
      if (!response.ok || !json.ok || !Array.isArray(json.files)) {
        setSyncStatusMessage(json.error ?? "Failed to open directory");
        return;
      }

      if (json.projectRoot) setProjectRoot(json.projectRoot);
      if (json.projectName) setProjectName(json.projectName);
      setFiles(json.files);
      filesRef.current = json.files;
      setDirtyPaths(new Set());
      saveLocalRecoverySnapshot(null);
      setSaveState("saved");
      setCompilerDiagnostics([]);
      setLastBuild(null);
      setPdfBytes(null);
      setSyncTarget(null);

      if (json.files.length > 0) {
        const bestRoot =
          rankRootCandidates(
            json.files.map((f) => ({ path: f.path, content: f.content })),
          )[0]?.path ?? json.files[0]!.path;
        setActiveFilePath(bestRoot);
      }
    })();
  }, []);

  const handleForwardSearch = useCallback(async () => {
    if (!lastBuild?.synctexAvailable) {
      setSyncStatusMessage("Compile PDF before SyncTeX");
      return;
    }
    const { line, column } = cursorMetricsRef.current;
    try {
      const response = await fetch("/api/synctex/forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rootFile: rootFilePath,
          path: activeFile.path,
          line,
          column,
        }),
      });
      const json = (await response.json()) as {
        ok: boolean;
        target?: ForwardSyncTarget;
        error?: string;
      };
      if (json.ok && json.target !== undefined) {
        setSyncTarget(json.target);
        setSyncStatusMessage(
          `Fwd → P${String(json.target.page)} (${Math.round(json.target.x)}, ${Math.round(json.target.y)})`,
        );
      } else {
        setSyncStatusMessage(json.error ?? "No forward target");
      }
    } catch {
      setSyncStatusMessage("Forward search unavailable");
    }
  }, [activeFile.path, lastBuild, rootFilePath]);

  const handleInverseSearch = useCallback(
    async (page: number, x: number, y: number) => {
      try {
        const response = await fetch("/api/synctex/inverse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rootFile: rootFilePath,
            page,
            x,
            y,
          }),
        });
        const json = (await response.json()) as {
          ok: boolean;
          target?: InverseSyncTarget;
          error?: string;
        };
        if (!json.ok || json.target === undefined) {
          setSyncStatusMessage(json.error ?? "No inverse match");
          return;
        }
        const target = json.target;
        setActiveFilePath(target.path);
        setViewMode("code");
        setNavigationTarget({
          filePath: target.path,
          line: target.line,
          column: target.column ?? 1,
          nonce: Date.now(),
        });
        setSyncStatusMessage(`Inv → ${target.path}:${String(target.line)}`);
      } catch {
        setSyncStatusMessage("Inverse search unavailable");
      }
    },
    [rootFilePath],
  );

  const handleJumpToOutlineHeading = useCallback(
    (heading: OutlineHeading) => {
      setViewMode("code");
      setNavigationTarget({
        filePath: activeFile.path,
        offset: heading.from,
        nonce: Date.now(),
      });
    },
    [activeFile.path],
  );

  const handleJumpToCodeLine = useCallback(
    (lineNumber: number) => {
      setViewMode("code");
      setNavigationTarget({
        filePath: activeFile.path,
        line: lineNumber,
        column: 1,
        nonce: Date.now(),
      });
    },
    [activeFile.path],
  );

  const errorCount = mergedDiagnostics.drawerItems.filter(
    (d) => d.category === "error",
  ).length;
  const warningCount = mergedDiagnostics.drawerItems.filter(
    (d) => d.category === "warning",
  ).length;
  const issueSummary = formatIssueCounts(errorCount, warningCount);

  const compileStatus: CompileStatus = compiling
    ? "compiling"
    : lastBuild?.status === "failed" || errorCount > 0
      ? "error"
      : warningCount > 0
        ? "warning"
        : "ready";

  const statusLabel = compiling
    ? "Compiling..."
    : lastBuild !== null
      ? lastBuild.status === "succeeded"
        ? `PDF Ready · ${String(lastBuild.durationMs)} ms (${
            lastBuild.tier === "tier2-fmt" ? "fmt" : "latexmk"
          })${issueSummary ? ` · ${issueSummary}` : ""}`
        : issueSummary
          ? `${issueSummary} · ${String(lastBuild.durationMs)} ms`
          : `Build Failed · ${String(lastBuild.durationMs)} ms`
      : issueSummary
        ? issueSummary
        : "AST Ready";

  return (
    <div className="tp-shell">
      {/* Strict 40px Non-Wrapping Single Window Header Bar */}
      <header className="tp-header" data-testid="app-header">
        <div className="tp-header-left">
          <button
            type="button"
            className={`tp-icon-btn${sidebarOpen ? " active" : ""}`}
            onClick={() => setSidebarOpen((open) => !open)}
            title="Toggle sidebar"
            aria-label="Toggle sidebar"
          >
            Sidebar
          </button>
          <div className="tp-breadcrumb">
            <span className="tp-project-title">{projectName}</span>
            <span className="tp-breadcrumb-sep">/</span>
            <span className="tp-active-file">{activeFile.path}</span>
            {dirtyPaths.has(activeFile.path) ? (
              <span className="tp-dirty-dot" title="Unsaved edits" />
            ) : null}
          </div>
        </div>

        <div className="tp-header-center">
          <div className="tp-segmented" role="group" aria-label="Editor view mode">
            <button
              type="button"
              className={`tp-segmented-btn${viewMode === "code" ? " active" : ""}`}
              onClick={() => setViewMode("code")}
            >
              Code
            </button>
            <button
              type="button"
              className={`tp-segmented-btn${viewMode === "visual" ? " active" : ""}`}
              onClick={() => setViewMode("visual")}
            >
              Visual
            </button>
          </div>
        </div>

        <div className="tp-header-right">
          <button
            type="button"
            className="tp-status-pill"
            data-status={compileStatus}
            data-testid="status-pill"
            onClick={() => setDrawerOpen((open) => !open)}
            title="Toggle diagnostics drawer"
          >
            <span className="tp-status-dot" />
            <span className="tp-status-label">{statusLabel}</span>
          </button>

          {compiling ? (
            <button
              type="button"
              className="tp-icon-btn"
              onClick={() => void handleCancelCompile()}
              data-testid="cancel-build-button"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              className="tp-primary-btn"
              onClick={handleCompileTrigger}
              data-testid="compile-button"
            >
              <span>Compile</span>
              <span className="tp-keycap">
                {typeof navigator !== "undefined" &&
                /Mac|iPhone|iPad/iu.test(navigator.platform)
                  ? "⌘↵"
                  : "Ctrl+↵"}
              </span>
            </button>
          )}

          <button
            type="button"
            className={`tp-icon-btn${theme === "dark" ? " active" : ""}`}
            onClick={() => setTheme((prev) => (prev === "light" ? "dark" : "light"))}
            data-testid="theme-toggle"
            aria-label="Toggle Light/Dark theme"
          >
            {theme === "light" ? "Dark" : "Light"}
          </button>

          <button
            type="button"
            className={`tp-icon-btn${pdfPaneOpen ? " active" : ""}`}
            onClick={() => setPdfPaneOpen((open) => !open)}
            aria-label="Toggle PDF pane"
          >
            PDF
          </button>
        </div>
      </header>

      {/* Apple HIG 3-Pane Split Workspace */}
      <main className="tp-workspace">
        {sidebarOpen ? (
          <SidebarPane
            files={files}
            activeFilePath={activeFile.path}
            outline={outline}
            symbolIndex={symbolIndex}
            projectRoot={projectRoot}
            onSelectFile={(path) => setActiveFilePath(path)}
            onSelectOutlineHeading={handleJumpToOutlineHeading}
            onExportZip={handleExportZip}
            onImportZip={handleImportZip}
            onOpenFolder={handleOpenFolder}
          />
        ) : null}

        <section className="tp-center-pane" aria-label="Editor workspace">
          {viewMode === "code" ? (
            <LatexEditorPane
              filePath={activeFile.path}
              content={activeFile.content}
              symbolIndex={symbolIndex}
              compilerDiagnostics={compilerDiagnostics}
              navigationTarget={navigationTarget}
              onContentChange={handleContentChange}
              onSnapshotUpdate={handleSnapshotUpdate}
              onDiagnosticsUpdate={handleDiagnosticsUpdate}
              onCompileTrigger={handleCompileTrigger}
            />
          ) : (
            <VisualReadingPane
              docText={activeFile.content}
              filePath={activeFile.path}
              onJumpToCodeLine={handleJumpToCodeLine}
            />
          )}

          {drawerOpen ? (
            <DiagnosticsDrawer
              diagnostics={mergedDiagnostics.drawerItems}
              activeTab={drawerTab}
              onTabChange={setDrawerTab}
              failureReason={lastBuild?.failureReason ?? null}
              activeFilePath={activeFile.path}
              onSelectDiagnostic={handleSelectDiagnostic}
              onApplyPackageQuickFix={handleApplyPackageQuickFix}
              onClose={() => setDrawerOpen(false)}
            />
          ) : null}
        </section>

        {pdfPaneOpen ? (
          <PdfView
            pdfBytes={pdfBytes}
            buildId={lastBuild?.buildId ?? null}
            lastBuild={lastBuild}
            compiling={compiling}
            syncTarget={syncTarget}
            syncStatusMessage={syncStatusMessage}
            onCompileNow={(forceFull) => void triggerCompile(forceFull === true)}
            onForwardSearch={() => void handleForwardSearch()}
            onInverseSearch={(page, x, y) => void handleInverseSearch(page, x, y)}
          />
        ) : null}
      </main>

      {/* Tabular-Nums Status Strip with IDocumentContextProvider Seam Telemetry */}
      <footer className="tp-statusbar">
        <div className="tp-statusbar-group">
          <span>
            Ln {String(cursorMetrics.line)}, Col {String(cursorMetrics.column)}
          </span>
          {cursorMetrics.section !== null ? (
            <span>§ {cursorMetrics.section}</span>
          ) : null}
          {cursorMetrics.env !== null ? (
            <span>\begin&#123;{cursorMetrics.env}&#125;</span>
          ) : null}
          <span data-testid="autosave-status">
            {saveState === "saving"
              ? "Autosaving..."
              : saveState === "unsaved"
                ? "Unsaved (buffered)"
                : saveState === "recovered"
                  ? "Recovered unsaved draft"
                  : "Saved"}
          </span>
        </div>
        <div className="tp-statusbar-group">
          <span>Lezer AST: {String(cursorMetrics.astNodes)} nodes</span>
          <span>IDocumentContextProvider: Active</span>
        </div>
      </footer>
    </div>
  );
}
