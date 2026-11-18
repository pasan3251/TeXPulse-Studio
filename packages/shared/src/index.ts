/**
 * Shared types, compile constants, pure workspace helpers, and the v2
 * IDocumentContextProvider seam for TeXPulse Studio 2.0.
 */

export const LATEXMK_BASE_FLAGS = [
  "-interaction=nonstopmode",
  "-file-line-error",
  "-synctex=1",
  "-no-shell-escape",
] as const;

export type ThemeMode = "light" | "dark";
export type EditorViewMode = "code" | "visual";
export type CompileStatus = "ready" | "compiling" | "error" | "warning";
export type DiagnosticSeverity = "error" | "warning" | "info";
export type DiagnosticCategory = "error" | "warning" | "typesetting";
export type DiagnosticSource = "ast" | "latex-log" | "bib-log";
export type ProjectFileKind = "tex" | "bib" | "sty" | "cls" | "asset" | "other";

export interface PackageSuggestionAction {
  type: "insert-package";
  packageName: string;
  command?: string | undefined;
  description?: string | undefined;
}

export interface DiagnosticItem {
  id: string;
  severity: DiagnosticSeverity;
  category: DiagnosticCategory;
  source: DiagnosticSource;
  file: string;
  line: number;
  column?: number | undefined;
  message: string;
  humanTitle: string;
  explanation: string;
  rawLog: string;
  ruleId: string;
  quickFix?: PackageSuggestionAction | undefined;
}

export type CompileEngine = "pdflatex" | "xelatex" | "lualatex";
export type CompileTier = "tier2-fmt" | "tier3-latexmk";

export interface CompileRequestPayload {
  rootFile?: string | undefined;
  engine?: CompileEngine | undefined;
  forceFullBuild?: boolean | undefined;
  files?: ReadonlyArray<{ path: string; content: string }> | undefined;
}

export interface CompileResultPayload {
  buildId: string;
  status: "succeeded" | "failed" | "cancelled" | "timed-out";
  tier: CompileTier;
  engine: CompileEngine;
  durationMs: number;
  preambleHash: string;
  preambleCacheHit: boolean;
  pdfAvailable: boolean;
  synctexAvailable: boolean;
  logText: string;
  blgText: string;
  diagnostics: readonly DiagnosticItem[];
  failureReason: string | null;
  completedAt: string;
}

export interface RecoveryBufferSnapshot {
  path: string;
  content: string;
  lastModified: number;
}

export interface RecoverySnapshotPayload {
  schemaVersion: 1;
  savedAt: string;
  activeFilePath: string;
  buffers: readonly RecoveryBufferSnapshot[];
}

export interface ForwardSyncTarget {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface InverseSyncTarget {
  path: string;
  line: number;
  column: number | null;
}

/**
 * PDF.js `viewport.convertToPdfPoint(domX, domY)` returns PDF user-space
 * coordinates with a bottom-left origin (y = 0 at bottom of page).
 * `synctex edit` requires top-left origin coordinates in PDF points (bp).
 */
export function invertPdfJsYToSynctex(
  pdfYBottomLeft: number,
  pageHeightPt: number,
): number {
  if (
    !Number.isFinite(pdfYBottomLeft) ||
    !Number.isFinite(pageHeightPt) ||
    pageHeightPt <= 0
  ) {
    return 0;
  }
  return Math.max(0, Math.min(pageHeightPt, pageHeightPt - pdfYBottomLeft));
}

export interface EditorDiagnostic {
  id: string;
  severity: DiagnosticSeverity;
  category?: DiagnosticCategory | undefined;
  source?: DiagnosticSource | undefined;
  filePath?: string | undefined;
  message: string;
  humanTitle?: string | undefined;
  explanation?: string | undefined;
  rawLog?: string | undefined;
  from: number;
  to: number;
  line: number;
  column: number;
  ruleId: string;
  quickFixHint?: string | undefined;
  quickFix?: PackageSuggestionAction | undefined;
}

export interface ProjectFile {
  path: string;
  content: string;
  kind: ProjectFileKind;
  lastModified: number;
}

export interface ProjectAssetFile {
  path: string;
  kind: "asset";
  sizeBytes: number;
  lastModified: number;
}

export interface TexToolHealth {
  name: "pdflatex" | "latexmk" | "synctex";
  available: boolean;
  path: string | null;
}

export interface TexEnvironmentHealth {
  healthy: boolean;
  missing: readonly ("pdflatex" | "latexmk" | "synctex")[];
  tools: readonly TexToolHealth[];
}

export interface ProjectTreeEntryInput {
  path: string;
  kind: "file" | "directory" | "link";
}

export interface ProjectTreeNode {
  name: string;
  path: string;
  kind: "file" | "directory" | "link";
  children: ProjectTreeNode[];
}

export interface RootCandidate {
  path: string;
  score: number;
  reasons: string[];
}

export interface OutlineHeading {
  id: string;
  level: 1 | 2 | 3 | 4;
  title: string;
  command: string;
  line: number;
  from: number;
}

export interface LabelSymbol {
  key: string;
  filePath: string;
  line: number;
  contextTitle: string;
}

export interface BibEntrySymbol {
  key: string;
  entryType: string;
  title: string;
  author: string;
  year: string;
  filePath: string;
  line: number;
}

export interface ProjectSymbolIndex {
  labels: readonly LabelSymbol[];
  citations: readonly BibEntrySymbol[];
}

export interface ActiveMathBlock {
  latex: string;
  displayMode: boolean;
  delimiter: string;
  from: number;
  to: number;
  line: number;
}

export interface CursorScope {
  filePath: string;
  line: number;
  column: number;
  offset: number;
  currentSection: string | null;
  activeEnvironment: string | null;
  surroundingLines: string;
  selectedText: string;
  activeMathBlock: ActiveMathBlock | null;
}

export interface SyntaxTreeNodeSummary {
  name: string;
  from: number;
  to: number;
}

export interface SyntaxTreeSnapshot {
  length: number;
  topNodeName: string;
  cursorNodeName: string;
  nodeCount: number;
  rawTree: unknown;
  nodes: readonly SyntaxTreeNodeSummary[];
}

/**
 * Architectural seam connecting CodeMirror 6's live Lezer AST, cursor scope,
 * indexed project symbols, and parsed diagnostics to both local intelligence
 * and the v2.0 `IAssistantService`.
 */
export interface IDocumentContextProvider {
  getSyntaxTree(): SyntaxTreeSnapshot;
  getCursorScope(): CursorScope;
  getProjectSymbols(): ProjectSymbolIndex;
  getDiagnostics(): readonly EditorDiagnostic[];
}

export interface TexCountSectionBreakdown {
  title: string;
  wordsInText: number;
  wordsInHeaders: number;
  wordsInCaptions: number;
  mathInlines: number;
  mathDisplay: number;
  filePath?: string | undefined;
  line?: number | undefined;
}

export interface TexCountResultPayload {
  source: "texcount" | "ast-fallback";
  wordsInText: number;
  wordsInHeaders: number;
  wordsInCaptions: number;
  totalWords: number;
  mathInlines: number;
  mathDisplay: number;
  characterCount: number;
  sections: readonly TexCountSectionBreakdown[];
}

export type AssistantProviderKind =
  | "ollama"
  | "lmstudio"
  | "custom-openai"
  | "gemini"
  | "offline-fallback";

export interface AssistantProviderConfig {
  provider: AssistantProviderKind;
  endpointUrl: string;
  model: string;
  enabled: boolean;
  apiKey?: string | undefined;
}

export interface EditorSettingsConfig {
  engine: CompileEngine;
  autoCompileOnPause: boolean;
  assistant: AssistantProviderConfig;
}

export interface AssistantStatusPayload {
  connected: boolean;
  provider: AssistantProviderKind;
  model: string;
  endpointUrl: string;
  statusLabel: string;
  availableModels: readonly string[];
}

export interface ContextAnchoredPromptInput {
  filePath: string;
  line: number;
  currentSection: string | null;
  activeEnvironment: string | null;
  loadedPackages: readonly string[];
  surroundingLines: string;
  validLabels: readonly string[];
  validCitationKeys: readonly string[];
  diagnostic?: DiagnosticItem | undefined;
  instruction?: string | undefined;
}

export interface ErrorFixProposal {
  provider: AssistantProviderKind;
  summary: string;
  targetFile: string;
  startLine: number;
  endLine: number;
  originalSnippet: string;
  replacementSnippet: string;
  unifiedDiff: string;
}

export interface InlineGenerationResult {
  provider: AssistantProviderKind;
  mode: "latex-insert" | "citation-insert";
  summary: string;
  latex: string;
  bibEntry?: string | undefined;
  citationKey?: string | undefined;
}

export interface IAssistantService {
  getStatus(): Promise<AssistantStatusPayload>;
  configure(config: Partial<AssistantProviderConfig>): Promise<AssistantStatusPayload>;
  proposeErrorFix(input: ContextAnchoredPromptInput): Promise<ErrorFixProposal>;
  generateInlineLatex(input: ContextAnchoredPromptInput): Promise<InlineGenerationResult>;
}

export {
  ASSET_FILE_EXTENSIONS,
  buildIncludeGraphicsSnippet,
  buildProjectTree,
  inferProjectFileKind,
  isBinaryAssetPath,
  rankRootCandidates,
} from "./project-helpers.js";
export { DEFAULT_PROJECT_FILES, DEFAULT_PROJECT_NAME } from "./default-project.js";
