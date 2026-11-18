import {
  buildIncludeGraphicsSnippet,
  isBinaryAssetPath,
  rankRootCandidates,
  type AssistantProviderConfig,
  type AssistantStatusPayload,
  type CompileResultPayload,
  type CompileStatus,
  type ContextAnchoredPromptInput,
  type DiagnosticCategory,
  type DiagnosticItem,
  type EditorDiagnostic,
  type EditorSettingsConfig,
  type EditorViewMode,
  type ErrorFixProposal,
  type ForwardSyncTarget,
  type InlineGenerationResult,
  type InverseSyncTarget,
  type OutlineHeading,
  type PackageSuggestionAction,
  type ProjectAssetFile,
  type ProjectFile,
  type RecoverySnapshotPayload,
  type TexCountResultPayload,
  type TexCountSectionBreakdown,
  type TexEnvironmentHealth,
  type ThemeMode,
} from "@texpulse/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DiagnosticsDrawer } from "./components/DiagnosticsDrawer.js";
import {
  LatexEditorPane,
  type EditorNavigationTarget,
  type EditorSnapshotPayload,
  type InlineInsertionPayload,
} from "./components/LatexEditorPane.js";
import { PdfView } from "./components/PdfView.js";
import { SettingsModal } from "./components/SettingsModal.js";
import { SidebarPane } from "./components/SidebarPane.js";
import { VisualReadingPane } from "./components/VisualReadingPane.js";
import { WordCountPopover } from "./components/WordCountPopover.js";
import {
  DEFAULT_PROJECT_FILES,
  DEFAULT_PROJECT_NAME,
} from "./data/defaultProject.js";
import {
  buildMergedDiagnosticsView,
  insertPackageIntoPreamble,
} from "./editor/diagnostics-merge.js";
import { resolveLatexDefinitionAtOffset } from "./editor/go-to-definition.js";
import { DocumentContextProvider } from "./services/DocumentContext.js";
import { buildProjectSymbolIndex } from "./services/WorkspaceIndexer.js";
import {
  DEFAULT_SIDEBAR_WIDTH,
  DEFAULT_SPLIT_RATIO,
  clampSidebarWidth,
  computeSplitRatioFromPointer,
  loadPersistedSidebarWidth,
  loadPersistedSplitRatio,
  savePersistedSidebarWidth,
  savePersistedSplitRatio,
} from "./utils/layout-ergonomics.js";
import {
  applyLineReplacement,
  buildSurroundingSnippet,
  computeSelectionMetrics,
  extractLoadedPackages,
} from "./utils/word-count.js";

const THEME_STORAGE_KEY = "texpulse.theme";
const RECOVERY_STORAGE_KEY = "texpulse.recovery.v1";
const SETTINGS_STORAGE_KEY = "texpulse.settings.v2";

const DEFAULT_SETTINGS: EditorSettingsConfig = {
  engine: "pdflatex",
  autoCompileOnPause: false,
  assistant: {
    provider: "ollama",
    endpointUrl: "http://127.0.0.1:11434/v1",
    model: "qwen2.5-coder:7b",
    enabled: true,
  },
};

function loadPersistedSettings(): EditorSettingsConfig {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<EditorSettingsConfig>;
    const engine =
      parsed.engine === "xelatex" || parsed.engine === "lualatex"
        ? parsed.engine
        : "pdflatex";
    const assistant = parsed.assistant;
    const provider =
      assistant?.provider === "ollama" ||
      assistant?.provider === "lmstudio" ||
      assistant?.provider === "custom-openai" ||
      assistant?.provider === "gemini" ||
      assistant?.provider === "offline-fallback"
        ? assistant.provider
        : DEFAULT_SETTINGS.assistant.provider;
    return {
      engine,
      autoCompileOnPause: parsed.autoCompileOnPause === true,
      assistant: {
        provider,
        endpointUrl:
          typeof assistant?.endpointUrl === "string" && assistant.endpointUrl.trim()
            ? assistant.endpointUrl.trim()
            : DEFAULT_SETTINGS.assistant.endpointUrl,
        model:
          typeof assistant?.model === "string" && assistant.model.trim()
            ? assistant.model.trim()
            : DEFAULT_SETTINGS.assistant.model,
        enabled: assistant?.enabled !== false,
        ...(typeof assistant?.apiKey === "string" && assistant.apiKey.trim()
          ? { apiKey: assistant.apiKey.trim() }
          : {}),
      },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function savePersistedSettings(next: EditorSettingsConfig): void {
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota errors
  }
}

function getRequestedOpenFileFromUrl(): string | null {
  try {
    const raw = new URLSearchParams(window.location.search).get("openFile");
    const trimmed = raw?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

function findMatchingOpenFile(
  files: readonly ProjectFile[],
  requested: string | null,
): string | null {
  if (!requested) return null;
  const normReq = requested.replace(/\\/gu, "/");
  const lowerReq = normReq.toLowerCase();
  const exact = files.find((f) => f.path === normReq);
  if (exact) return exact.path;
  const ci = files.find((f) => f.path.toLowerCase() === lowerReq);
  if (ci) return ci.path;
  const base = normReq.split("/").at(-1)?.toLowerCase() ?? lowerReq;
  const byBase = files.find(
    (f) => (f.path.split("/").at(-1)?.toLowerCase() ?? "") === base,
  );
  return byBase?.path ?? null;
}

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

function computeLocalFallbackWordCount(files: readonly ProjectFile[]): TexCountResultPayload {
  const activeTex = files.filter((f) => f.kind === "tex");
  let totalChars = 0;
  let totalWords = 0;
  for (const f of activeTex) {
    totalChars += f.content.length;
    totalWords += computeSelectionMetrics(f.content).words;
  }
  return {
    source: "ast-fallback",
    wordsInText: totalWords,
    wordsInHeaders: 0,
    wordsInCaptions: 0,
    totalWords,
    mathInlines: 0,
    mathDisplay: 0,
    characterCount: totalChars,
    sections: [],
  };
}

export function App() {
  const [theme, setTheme] = useState<ThemeMode>(loadPersistedTheme);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pdfPaneOpen, setPdfPaneOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DiagnosticCategory>("error");
  const [viewMode, setViewMode] = useState<EditorViewMode>("code");

  const [splitRatio, setSplitRatio] = useState<number>(loadPersistedSplitRatio);
  const [sidebarWidth, setSidebarWidth] = useState<number>(loadPersistedSidebarWidth);
  const [activeSash, setActiveSash] = useState<"sidebar" | "editor-pdf" | null>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const sidebarOpenRef = useRef(sidebarOpen);
  sidebarOpenRef.current = sidebarOpen;
  const splitRatioRef = useRef(splitRatio);
  splitRatioRef.current = splitRatio;
  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;

  const [projectName, setProjectName] = useState(DEFAULT_PROJECT_NAME);
  const [projectRoot, setProjectRoot] = useState(".texpulse-workspace");
  const [files, setFiles] = useState<ProjectFile[]>(() =>
    DEFAULT_PROJECT_FILES.map((file) => ({ ...file })),
  );
  const [assets, setAssets] = useState<ProjectAssetFile[]>([]);
  const [texHealth, setTexHealth] = useState<TexEnvironmentHealth | null>(null);
  const [texBannerDismissed, setTexBannerDismissed] = useState(false);
  const [fileActionError, setFileActionError] = useState<string | null>(null);
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
    selectedText: "",
  });

  const [compiling, setCompiling] = useState(false);
  const [lastBuild, setLastBuild] = useState<CompileResultPayload | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [syncTarget, setSyncTarget] = useState<ForwardSyncTarget | null>(null);
  const [syncStatusMessage, setSyncStatusMessage] = useState<string | null>(null);
  const [navigationTarget, setNavigationTarget] =
    useState<EditorNavigationTarget | null>(null);

  // Phase 4 v1.1 Word Count Popover state
  const [texCounts, setTexCounts] = useState<TexCountResultPayload>(() =>
    computeLocalFallbackWordCount(DEFAULT_PROJECT_FILES),
  );
  const [wordCountPopoverOpen, setWordCountPopoverOpen] = useState(false);
  const [wordCountLoading, setWordCountLoading] = useState(false);

  // Phase 4 v2.0 AI Assistant & Phase 5 Settings state (Local-first via IAssistantService)
  const [settings, setSettings] = useState<EditorSettingsConfig>(loadPersistedSettings);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [aiStatus, setAiStatus] = useState<AssistantStatusPayload | null>(null);
  const [commandBarOpen, setCommandBarOpen] = useState(false);
  const [aiCommandBusy, setAiCommandBusy] = useState(false);
  const [aiCommandError, setAiCommandError] = useState<string | null>(null);
  const [inlineInsertion, setInlineInsertion] =
    useState<InlineInsertionPayload | null>(null);
  const [aiFixLoadingId, setAiFixLoadingId] = useState<string | null>(null);
  const [aiFixProposal, setAiFixProposal] = useState<{
    diagnosticId: string;
    proposal: ErrorFixProposal;
  } | null>(null);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

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

  const sashCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      sashCleanupRef.current?.();
      document.body.classList.remove("tp-is-resizing");
    };
  }, []);

  // Keyboard toggle for Sidebar: Mod-Shift-E anywhere, or Mod-B outside text inputs/CodeMirror
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;
      const lower = event.key.toLowerCase();
      if (event.shiftKey && lower === "e") {
        event.preventDefault();
        setSidebarOpen((open) => !open);
        return;
      }
      if (!event.shiftKey && !event.altKey && lower === "b") {
        const target = event.target as HTMLElement | null;
        const insideEditable =
          target !== null &&
          target.closest(".cm-editor, input, textarea, select") !== null;
        if (!insideEditable) {
          event.preventDefault();
          setSidebarOpen((open) => !open);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const startSashDrag = useCallback(
    (kind: "sidebar" | "editor-pdf", startClientX: number) => {
      sashCleanupRef.current?.();
      const startSidebarW = sidebarWidthRef.current;
      setActiveSash(kind);
      document.body.classList.add("tp-is-resizing");

      const handleMove = (moveClientX: number) => {
        if (kind === "sidebar") {
          const nextWidth = clampSidebarWidth(startSidebarW + (moveClientX - startClientX));
          sidebarWidthRef.current = nextWidth;
          setSidebarWidth(nextWidth);
          return;
        }
        const workspace = workspaceRef.current;
        if (workspace === null) return;
        const rect = workspace.getBoundingClientRect();
        const sidebarOffset = sidebarOpenRef.current ? sidebarWidthRef.current : 0;
        const splitAreaLeft = rect.left + sidebarOffset;
        const splitAreaWidth = Math.max(1, rect.width - sidebarOffset);
        const nextRatio = computeSplitRatioFromPointer(
          moveClientX,
          splitAreaLeft,
          splitAreaWidth,
        );
        splitRatioRef.current = nextRatio;
        setSplitRatio(nextRatio);
      };

      const onMouseMove = (e: MouseEvent) => handleMove(e.clientX);
      const onPointerMove = (e: PointerEvent) => handleMove(e.clientX);
      const finish = () => {
        document.body.classList.remove("tp-is-resizing");
        setActiveSash(null);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("mouseup", finish);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        sashCleanupRef.current = null;
        if (kind === "sidebar") {
          savePersistedSidebarWidth(sidebarWidthRef.current);
        } else {
          savePersistedSplitRatio(splitRatioRef.current);
        }
      };

      sashCleanupRef.current = finish;
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("mouseup", finish);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
    },
    [],
  );

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

  const refreshTexCount = useCallback(
    async (targetRoot?: string, overrideFiles?: readonly ProjectFile[]) => {
      const currentFiles = overrideFiles ?? filesRef.current;
      const root =
        targetRoot ??
        rankRootCandidates(
          currentFiles.map((f) => ({ path: f.path, content: f.content })),
        )[0]?.path ??
        "main.tex";
      setWordCountLoading(true);
      try {
        const res = await fetch("/api/texcount", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rootFile: root,
            files: currentFiles.map((f) => ({ path: f.path, content: f.content })),
          }),
        });
        if (!res.ok) return;
        const json = (await res.json()) as {
          ok?: boolean;
          counts?: TexCountResultPayload;
        };
        if (json.ok && json.counts) {
          setTexCounts(json.counts);
        }
      } catch {
        setTexCounts(computeLocalFallbackWordCount(currentFiles));
      } finally {
        setWordCountLoading(false);
      }
    },
    [],
  );

  const refreshAssistantStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/assistant/status");
      if (!res.ok) return;
      const json = (await res.json()) as {
        ok?: boolean;
        status?: AssistantStatusPayload;
      };
      if (json.ok && json.status) {
        setAiStatus(json.status);
      }
    } catch {
      // Ignore offline status probe errors
    }
  }, []);

  const syncAssistantConfig = useCallback(
    async (
      config: AssistantProviderConfig,
      verifyStatusRoute = false,
    ): Promise<AssistantStatusPayload> => {
      try {
        const cfgRes = await fetch("/api/assistant/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
        });
        const cfgJson = (await cfgRes.json().catch(() => ({}))) as {
          ok?: boolean;
          status?: AssistantStatusPayload;
        };

        if (verifyStatusRoute) {
          const statusRes = await fetch("/api/assistant/status");
          if (statusRes.ok) {
            const statusJson = (await statusRes.json()) as {
              ok?: boolean;
              status?: AssistantStatusPayload;
            };
            if (statusJson.ok && statusJson.status) {
              setAiStatus(statusJson.status);
              return statusJson.status;
            }
          }
        }

        if (cfgJson.ok && cfgJson.status) {
          setAiStatus(cfgJson.status);
          return cfgJson.status;
        }
      } catch {
        // Fallback offline descriptor below
      }

      const offlineFallback: AssistantStatusPayload = {
        connected: false,
        provider: config.provider,
        model: config.model,
        endpointUrl: config.endpointUrl,
        statusLabel: "Offline: Backend server unreachable",
        availableModels: [],
      };
      setAiStatus(offlineFallback);
      return offlineFallback;
    },
    [],
  );

  const handleSaveSettings = useCallback(
    (next: EditorSettingsConfig) => {
      setSettings(next);
      savePersistedSettings(next);
      void syncAssistantConfig(next.assistant);
    },
    [syncAssistantConfig],
  );

  // Initial load from local server workspace, recovery overlay, texcount, and assistant probe
  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      try {
        const [res, healthRes] = await Promise.all([
          fetch("/api/project"),
          fetch("/api/health").catch(() => null),
        ]);
        if (healthRes && healthRes.ok) {
          const healthJson = (await healthRes.json().catch(() => ({}))) as {
            texEnvironment?: TexEnvironmentHealth;
          };
          if (!cancelled && healthJson.texEnvironment) {
            setTexHealth(healthJson.texEnvironment);
          }
        }
        if (!res.ok) return;
        const json = (await res.json()) as {
          ok?: boolean;
          projectRoot?: string;
          projectName?: string;
          files?: ProjectFile[];
          assets?: ProjectAssetFile[];
          recovery?: RecoverySnapshotPayload | null;
        };
        if (cancelled || !json.ok || !Array.isArray(json.files) || json.files.length === 0) {
          return;
        }
        setAssets(Array.isArray(json.assets) ? json.assets : []);

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
        const requestedMatch = findMatchingOpenFile(
          hydratedFiles,
          getRequestedOpenFileFromUrl(),
        );
        const preferredActive =
          requestedMatch ??
          (chosenRec?.activeFilePath &&
          hydratedFiles.some((f) => f.path === chosenRec.activeFilePath)
            ? chosenRec.activeFilePath
            : ranked[0]?.path ?? hydratedFiles[0]!.path);
        setActiveFilePath(preferredActive);

        if (recoveredDirty.size > 0) {
          setDirtyPaths(recoveredDirty);
          setSaveState("recovered");
        } else {
          saveLocalRecoverySnapshot(null);
          setSaveState("saved");
        }

        void refreshTexCount(ranked[0]?.path ?? "main.tex", hydratedFiles);
        void syncAssistantConfig(settingsRef.current.assistant);
      } catch {
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
  }, [refreshTexCount, syncAssistantConfig]);

  // Immediate local recovery + debounced (600ms) atomic disk autosave + texcount refresh
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
          void refreshTexCount();
        } catch {
          setSaveState("unsaved");
        }
      })();
    }, 600);

    return () => window.clearTimeout(timer);
  }, [activeFilePath, dirtyPaths, files, refreshTexCount, workspaceHydrated]);

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
        selectedText: payload.selectedText,
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
            engine: settingsRef.current.engine,
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
        setAiFixProposal(null);

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
        void refreshTexCount(rankedRoot, payloadFiles);
      } catch (err) {
        setLastBuild({
          buildId: "offline",
          status: "failed",
          tier: "tier3-latexmk",
          engine: settingsRef.current.engine,
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
    [refreshTexCount],
  );

  const handleCompileTrigger = useCallback(() => {
    void triggerCompile(false);
  }, [triggerCompile]);

  // Opt-in Auto-Compile on Pause (Debounce 800ms)
  useEffect(() => {
    if (
      !workspaceHydrated ||
      !settings.autoCompileOnPause ||
      dirtyPaths.size === 0 ||
      compiling
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      void triggerCompile(false);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [
    compiling,
    dirtyPaths,
    files,
    settings.autoCompileOnPause,
    triggerCompile,
    workspaceHydrated,
  ]);

  const handleGoToDefinition = useCallback(
    (offset: number): boolean => {
      const currentFile =
        filesRef.current.find((f) => f.path === activeFilePathRef.current) ??
        filesRef.current[0];
      if (!currentFile) return false;
      const target = resolveLatexDefinitionAtOffset({
        docText: currentFile.content,
        offset,
        currentFilePath: currentFile.path,
        files: filesRef.current,
        symbolIndex,
      });
      if (!target) return false;

      setActiveFilePath(target.filePath);
      setViewMode("code");
      setNavigationTarget({
        filePath: target.filePath,
        line: target.line,
        column: target.column,
        nonce: Date.now(),
      });
      return true;
    },
    [symbolIndex],
  );

  const handleCancelCompile = useCallback(async () => {
    await fetch("/api/compile/cancel", { method: "POST" }).catch(() => undefined);
  }, []);

  const buildAnchoredContextInput = useCallback(
    (params: {
      filePath: string;
      line: number;
      diagnostic?: DiagnosticItem | undefined;
      instruction?: string | undefined;
    }): ContextAnchoredPromptInput => {
      const targetFileObj =
        filesRef.current.find((f) => f.path === params.filePath) ?? activeFile;
      const rootObj =
        filesRef.current.find((f) => f.path === rootFilePath) ?? targetFileObj;
      const scope = contextProviderRef.current.getCursorScope();
      const syms = contextProviderRef.current.getProjectSymbols();

      return {
        filePath: targetFileObj.path,
        line: params.line,
        currentSection: scope.currentSection,
        activeEnvironment: scope.activeEnvironment,
        loadedPackages: extractLoadedPackages(rootObj.content),
        surroundingLines: buildSurroundingSnippet(targetFileObj.content, params.line, 7),
        validLabels: syms.labels.map((l) => l.key),
        validCitationKeys: syms.citations.map((c) => c.key),
        diagnostic: params.diagnostic,
        instruction: params.instruction,
      };
    },
    [activeFile, rootFilePath],
  );

  const handleRequestAiFix = useCallback(
    (item: DiagnosticItem) => {
      void (async () => {
        setAiFixLoadingId(item.id);
        try {
          const payload = buildAnchoredContextInput({
            filePath: item.file,
            line: item.line,
            diagnostic: item,
          });
          const response = await fetch("/api/assistant/fix-error", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const json = (await response.json()) as {
            ok: boolean;
            proposal?: ErrorFixProposal;
          };
          if (json.ok && json.proposal) {
            setAiFixProposal({ diagnosticId: item.id, proposal: json.proposal });
          }
        } finally {
          setAiFixLoadingId(null);
        }
      })();
    },
    [buildAnchoredContextInput],
  );

  const handleApplyAiFix = useCallback(
    (proposal: ErrorFixProposal) => {
      const updatedFiles = filesRef.current.map((file) => {
        if (file.path !== proposal.targetFile) return file;
        return {
          ...file,
          content: applyLineReplacement(
            file.content,
            proposal.startLine,
            proposal.endLine,
            proposal.replacementSnippet,
          ),
          lastModified: Date.now(),
        };
      });
      filesRef.current = updatedFiles;
      setFiles(updatedFiles);
      setDirtyPaths(new Set([proposal.targetFile]));
      setAiFixProposal(null);
      void triggerCompile(false, updatedFiles);
    },
    [triggerCompile],
  );

  const handleSubmitInlineCommand = useCallback(
    (instruction: string) => {
      void (async () => {
        setAiCommandBusy(true);
        setAiCommandError(null);
        try {
          const scope = contextProviderRef.current.getCursorScope();
          const payload = buildAnchoredContextInput({
            filePath: activeFile.path,
            line: scope.line,
            instruction,
          });
          const response = await fetch("/api/assistant/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const json = (await response.json()) as {
            ok: boolean;
            result?: InlineGenerationResult;
            error?: string;
          };
          if (!json.ok || !json.result) {
            setAiCommandError(json.error ?? "Generation failed.");
            return;
          }

          const gen = json.result;
          // If Smart Citation returned a new BibTeX entry, append cleanly to references.bib
          if (gen.bibEntry && gen.citationKey) {
            const bibTarget =
              filesRef.current.find((f) => f.kind === "bib")?.path ?? "references.bib";
            const updatedFiles = filesRef.current.map((file) => {
              if (file.path !== bibTarget) return file;
              if (file.content.includes(`{${gen.citationKey!},`)) return file;
              const sep = file.content.endsWith("\n") ? "\n" : "\n\n";
              return {
                ...file,
                content: `${file.content}${sep}${gen.bibEntry!}\n`,
                lastModified: Date.now(),
              };
            });
            filesRef.current = updatedFiles;
            setFiles(updatedFiles);
            setDirtyPaths((prev) => new Set([...prev, bibTarget]));
          }

          setInlineInsertion({
            filePath: activeFile.path,
            text: gen.latex,
            nonce: Date.now(),
          });
          setCommandBarOpen(false);
        } catch {
          setAiCommandError("Assistant endpoint unreachable.");
        } finally {
          setAiCommandBusy(false);
        }
      })();
    },
    [activeFile.path, buildAnchoredContextInput],
  );

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

  const handleImportZip = useCallback(
    (zipFile: File) => {
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
          assets?: ProjectAssetFile[];
        };
        if (!json.ok || !Array.isArray(json.files) || json.files.length === 0) return;

        setFiles(json.files);
        filesRef.current = json.files;
        setAssets(Array.isArray(json.assets) ? json.assets : []);
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
        void refreshTexCount(bestRoot, json.files);
      })();
    },
    [refreshTexCount],
  );

  const handleOpenFolder = useCallback(
    (directoryPath: string) => {
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
          assets?: ProjectAssetFile[];
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
        setAssets(Array.isArray(json.assets) ? json.assets : []);
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
          void refreshTexCount(bestRoot, json.files);
        }
      })();
    },
    [refreshTexCount],
  );

  const handleCreateProjectFile = useCallback((filePath: string) => {
    void (async () => {
      setFileActionError(null);
      try {
        const defaultContent = filePath.toLowerCase().endsWith(".tex")
          ? `\\section{${filePath.replace(/\.tex$/iu, "").split("/").at(-1) ?? "New Section"}}\n\n`
          : "";
        const res = await fetch("/api/project/file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: filePath, content: defaultContent }),
        });
        const json = (await res.json()) as {
          ok?: boolean;
          file?: ProjectFile;
          files?: ProjectFile[];
          assets?: ProjectAssetFile[];
          error?: string;
        };
        if (!res.ok || !json.ok || !json.file) {
          setFileActionError(json.error ?? "Unable to create project file.");
          return;
        }
        if (Array.isArray(json.files)) {
          setFiles(json.files);
          filesRef.current = json.files;
        }
        if (Array.isArray(json.assets)) {
          setAssets(json.assets);
        }
        setActiveFilePath(json.file.path);
        setViewMode("code");
      } catch {
        setFileActionError("Backend unreachable while creating file.");
      }
    })();
  }, []);

  const handleDeleteProjectFile = useCallback(
    (filePath: string) => {
      void (async () => {
        setFileActionError(null);
        try {
          const res = await fetch(
            `/api/project/file?path=${encodeURIComponent(filePath)}`,
            { method: "DELETE" },
          );
          const json = (await res.json()) as {
            ok?: boolean;
            files?: ProjectFile[];
            assets?: ProjectAssetFile[];
            error?: string;
          };
          if (!res.ok || !json.ok) {
            setFileActionError(json.error ?? "Unable to delete file.");
            return;
          }
          const nextFiles = Array.isArray(json.files) ? json.files : filesRef.current;
          setFiles(nextFiles);
          filesRef.current = nextFiles;
          if (Array.isArray(json.assets)) {
            setAssets(json.assets);
          }
          setDirtyPaths((prev) => {
            if (!prev.has(filePath)) return prev;
            const next = new Set(prev);
            next.delete(filePath);
            return next;
          });
          if (activeFilePathRef.current === filePath && nextFiles.length > 0) {
            const best =
              rankRootCandidates(
                nextFiles.map((f) => ({ path: f.path, content: f.content })),
              )[0]?.path ?? nextFiles[0]!.path;
            setActiveFilePath(best);
          }
        } catch {
          setFileActionError("Backend unreachable while deleting file.");
        }
      })();
    },
    [],
  );

  const handleUploadFiles = useCallback((selectedFiles: readonly File[]) => {
    void (async () => {
      setFileActionError(null);
      for (const file of selectedFiles) {
        const cleanName = file.name.replace(/[\\/:*?"<>|]/gu, "_").trim();
        if (!cleanName) continue;
        try {
          if (isBinaryAssetPath(cleanName)) {
            const bytes = new Uint8Array(await file.arrayBuffer());
            const targetPath = `figures/${cleanName}`;
            const res = await fetch("/api/project/asset", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                path: targetPath,
                contentBase64: bytesToBase64(bytes),
              }),
            });
            const json = (await res.json()) as {
              ok?: boolean;
              files?: ProjectFile[];
              assets?: ProjectAssetFile[];
              error?: string;
            };
            if (!res.ok || !json.ok) {
              setFileActionError(json.error ?? `Failed to upload ${cleanName}`);
              continue;
            }
            if (Array.isArray(json.files)) {
              setFiles(json.files);
              filesRef.current = json.files;
            }
            if (Array.isArray(json.assets)) {
              setAssets(json.assets);
            }
          } else {
            const textContent = await file.text();
            const res = await fetch("/api/project/file", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ path: cleanName, content: textContent }),
            });
            if (!res.ok) {
              const errJson = (await res.json().catch(() => ({}))) as { error?: string };
              setFileActionError(errJson.error ?? `Failed to add ${cleanName}`);
              continue;
            }
            const projRes = await fetch("/api/project");
            if (projRes.ok) {
              const projJson = (await projRes.json()) as {
                files?: ProjectFile[];
                assets?: ProjectAssetFile[];
              };
              if (Array.isArray(projJson.files)) {
                setFiles(projJson.files);
                filesRef.current = projJson.files;
              }
              if (Array.isArray(projJson.assets)) {
                setAssets(projJson.assets);
              }
            }
          }
        } catch {
          setFileActionError(`Upload failed for ${cleanName}`);
        }
      }
    })();
  }, []);

  const handleInsertAssetSnippet = useCallback((assetPath: string) => {
    setViewMode("code");
    const targetPath = activeFilePathRef.current;
    setInlineInsertion({
      filePath: targetPath,
      text: buildIncludeGraphicsSnippet(assetPath),
      nonce: Date.now(),
    });
  }, []);

  const runForwardSyncAt = useCallback(
    async (sourcePathRel: string, line: number, column = 1) => {
      if (!lastBuild?.synctexAvailable) {
        setSyncStatusMessage("Compile PDF before SyncTeX");
        return;
      }
      try {
        const response = await fetch("/api/synctex/forward", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rootFile: rootFilePath,
            path: sourcePathRel,
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
    },
    [lastBuild, rootFilePath],
  );

  const handleForwardSearch = useCallback(async () => {
    const { line, column } = cursorMetricsRef.current;
    await runForwardSyncAt(activeFile.path, line, column);
  }, [activeFile.path, runForwardSyncAt]);

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
      if (lastBuild?.synctexAvailable) {
        void runForwardSyncAt(activeFile.path, lineNumber, 1);
      }
    },
    [activeFile.path, lastBuild, runForwardSyncAt],
  );

  const handleSelectTexCountSection = useCallback(
    (sec: TexCountSectionBreakdown) => {
      const targetPath = sec.filePath ?? activeFile.path;
      if (filesRef.current.some((f) => f.path === targetPath)) {
        setActiveFilePath(targetPath);
      }
      setViewMode("code");
      setNavigationTarget({
        filePath: targetPath,
        line: sec.line ?? 1,
        column: 1,
        nonce: Date.now(),
      });
      setWordCountPopoverOpen(false);
    },
    [activeFile.path],
  );

  const selectionMetrics = useMemo(
    () => computeSelectionMetrics(cursorMetrics.selectedText),
    [cursorMetrics.selectedText],
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
            className={`tp-sidebar-toggle-btn${sidebarOpen ? " active" : ""}`}
            data-testid="sidebar-toggle-button"
            onClick={() => setSidebarOpen((open) => !open)}
            title="Toggle Sidebar (Ctrl+B)"
            aria-label="Toggle Sidebar"
            aria-expanded={sidebarOpen}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <rect
                x="2"
                y="3"
                width="12"
                height="10"
                rx="1.5"
                stroke="currentColor"
                strokeWidth="1.35"
              />
              <line
                x1="6"
                y1="3"
                x2="6"
                y2="13"
                stroke="currentColor"
                strokeWidth="1.35"
              />
            </svg>
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
              data-testid="mode-code-btn"
              onClick={() => setViewMode("code")}
            >
              Code
            </button>
            <button
              type="button"
              className={`tp-segmented-btn${viewMode === "visual" ? " active" : ""}`}
              data-testid="mode-visual-btn"
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

          <button
            type="button"
            className={`tp-icon-btn${settingsModalOpen ? " active" : ""}`}
            onClick={() => setSettingsModalOpen(true)}
            data-testid="settings-button"
            aria-label="Compiler and Local AI Settings"
            title="Compiler and Local AI Settings"
          >
            Settings
          </button>
        </div>
      </header>

      {/* Apple HIG 3-Pane Split Workspace */}
      <main className="tp-workspace" ref={workspaceRef} data-testid="workspace-root">
        {sidebarOpen ? (
          <>
            <SidebarPane
              files={files}
              assets={assets}
              activeFilePath={activeFile.path}
              outline={outline}
              symbolIndex={symbolIndex}
              projectRoot={projectRoot}
              widthPx={sidebarWidth}
              fileActionError={fileActionError}
              onSelectFile={(path) => setActiveFilePath(path)}
              onInsertAssetSnippet={handleInsertAssetSnippet}
              onCreateFile={handleCreateProjectFile}
              onUploadFiles={handleUploadFiles}
              onDeleteFile={handleDeleteProjectFile}
              onSelectOutlineHeading={handleJumpToOutlineHeading}
              onExportZip={handleExportZip}
              onImportZip={handleImportZip}
              onOpenFolder={handleOpenFolder}
            />
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize sidebar"
              data-testid="sidebar-split-sash"
              className={`tp-split-sash${activeSash === "sidebar" ? " is-dragging" : ""}`}
              onMouseDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                startSashDrag("sidebar", event.clientX);
              }}
              onDoubleClick={() => {
                sidebarWidthRef.current = DEFAULT_SIDEBAR_WIDTH;
                setSidebarWidth(DEFAULT_SIDEBAR_WIDTH);
                savePersistedSidebarWidth(DEFAULT_SIDEBAR_WIDTH);
              }}
            />
          </>
        ) : null}

        <section
          className="tp-center-pane"
          aria-label="Editor workspace"
          data-testid="editor-center-pane"
          style={
            pdfPaneOpen
              ? { flex: `${String(splitRatio)} 1 0px` }
              : undefined
          }
        >
          {texHealth !== null && !texHealth.healthy && !texBannerDismissed ? (
            <div className="tp-env-banner" data-testid="tex-env-banner" role="status">
              <span>
                <strong>TeX toolchain missing:</strong>{" "}
                <code>{texHealth.missing.join(", ")}</code> not found on PATH. Install{" "}
                <strong>MiKTeX</strong> or <strong>TeX Live</strong> to compile PDFs locally.
              </span>
              <button
                type="button"
                className="tp-icon-btn"
                data-testid="dismiss-tex-banner-btn"
                onClick={() => setTexBannerDismissed(true)}
              >
                Dismiss
              </button>
            </div>
          ) : null}
          {viewMode === "code" ? (
            <LatexEditorPane
              filePath={activeFile.path}
              content={activeFile.content}
              symbolIndex={symbolIndex}
              compilerDiagnostics={compilerDiagnostics}
              navigationTarget={navigationTarget}
              inlineInsertion={inlineInsertion}
              commandBarOpen={commandBarOpen}
              aiStatus={aiStatus}
              aiCommandBusy={aiCommandBusy}
              aiCommandError={aiCommandError}
              onContentChange={handleContentChange}
              onSnapshotUpdate={handleSnapshotUpdate}
              onDiagnosticsUpdate={handleDiagnosticsUpdate}
              onCompileTrigger={handleCompileTrigger}
              onOpenCommandBar={() => {
                setAiCommandError(null);
                void refreshAssistantStatus();
                setCommandBarOpen(true);
              }}
              onCloseCommandBar={() => setCommandBarOpen(false)}
              onSubmitInlineCommand={handleSubmitInlineCommand}
              onGoToDefinition={handleGoToDefinition}
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
              aiFixLoadingId={aiFixLoadingId}
              aiFixProposal={aiFixProposal}
              onSelectDiagnostic={handleSelectDiagnostic}
              onApplyPackageQuickFix={handleApplyPackageQuickFix}
              onRequestAiFix={handleRequestAiFix}
              onApplyAiFix={handleApplyAiFix}
              onDiscardAiFix={() => setAiFixProposal(null)}
              onClose={() => setDrawerOpen(false)}
            />
          ) : null}
        </section>

        {pdfPaneOpen ? (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize editor and PDF panes"
              data-testid="editor-pdf-sash"
              className={`tp-split-sash${activeSash === "editor-pdf" ? " is-dragging" : ""}`}
              onMouseDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                startSashDrag("editor-pdf", event.clientX);
              }}
              onDoubleClick={() => {
                splitRatioRef.current = DEFAULT_SPLIT_RATIO;
                setSplitRatio(DEFAULT_SPLIT_RATIO);
                savePersistedSplitRatio(DEFAULT_SPLIT_RATIO);
              }}
            />
            <PdfView
              pdfBytes={pdfBytes}
              buildId={lastBuild?.buildId ?? null}
              lastBuild={lastBuild}
              compiling={compiling}
              syncTarget={syncTarget}
              syncStatusMessage={syncStatusMessage}
              style={{ flex: `${String(1 - splitRatio)} 1 0px`, width: "auto" }}
              onCompileNow={(forceFull) => void triggerCompile(forceFull === true)}
              onForwardSearch={() => void handleForwardSearch()}
              onInverseSearch={(page, x, y) => void handleInverseSearch(page, x, y)}
            />
          </>
        ) : null}
      </main>

      {wordCountPopoverOpen ? (
        <WordCountPopover
          counts={texCounts}
          loading={wordCountLoading}
          onRefresh={() => void refreshTexCount()}
          onSelectSection={handleSelectTexCountSection}
          onClose={() => setWordCountPopoverOpen(false)}
        />
      ) : null}

      {settingsModalOpen ? (
        <SettingsModal
          settings={settings}
          aiStatus={aiStatus}
          onSave={handleSaveSettings}
          onTestAiConnection={(config) => syncAssistantConfig(config, true)}
          onClose={() => setSettingsModalOpen(false)}
        />
      ) : null}

      {/* Tabular-Nums Status Strip with Word Count, Mod-K Trigger & Context Telemetry */}
      <footer className="tp-statusbar">
        <div className="tp-statusbar-group">
          <span>
            Ln {String(cursorMetrics.line)}, Col {String(cursorMetrics.column)}
          </span>
          {cursorMetrics.section !== null ? (
            <span>§ {cursorMetrics.section}</span>
          ) : null}
          <button
            type="button"
            className={`tp-statusbar-btn${wordCountPopoverOpen ? " active" : ""}`}
            data-testid="word-count-trigger"
            onClick={() => {
              if (!wordCountPopoverOpen) {
                void refreshTexCount();
              }
              setWordCountPopoverOpen((open) => !open);
            }}
            title="View per-section texcount breakdown"
          >
            {cursorMetrics.selectedText.length > 0
              ? `Selection: ${String(selectionMetrics.words)} words · ${String(selectionMetrics.chars)} chars`
              : `${String(texCounts.wordsInText)} words · ${String(texCounts.characterCount)} chars`}
          </button>
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
          <button
            type="button"
            className={`tp-statusbar-btn${commandBarOpen ? " active" : ""}`}
            data-testid="open-command-bar-btn"
            onClick={() => {
              setViewMode("code");
              setAiCommandError(null);
              void refreshAssistantStatus();
              setCommandBarOpen((open) => !open);
            }}
            title="Open Mod-K AI Inline Command Bar"
          >
            {typeof navigator !== "undefined" &&
            /Mac|iPhone|iPad/iu.test(navigator.platform)
              ? "⌘K AI"
              : "Ctrl+K AI"}
          </button>
          <span>Lezer AST: {String(cursorMetrics.astNodes)} nodes</span>
          <span>IDocumentContextProvider: Active</span>
        </div>
      </footer>
    </div>
  );
}
