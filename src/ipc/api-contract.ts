import type {
  CancelBuildResult,
  CompileProjectRequest,
  CompileProjectResult,
  CleanupAuxiliaryResult,
  LoadPdfResult,
  PdfActionResult,
  PdfArtifactRequest,
} from "./build-contracts.js";
import type { GlobalSettings } from "../settings/settings-types.js";
import type {
  CreateProjectEntryRequest,
  CreateTextFileRequest,
  DeleteProjectEntryRequest,
  ExportProjectResult,
  GitStatusResult,
  OpenProjectResult,
  OpenRecentProjectRequest,
  ProjectMutationResult,
  ProjectFileChange,
  ProjectPathRequest,
  ProjectWriteRequest,
  ReadTextFileResult,
  RecentProjectsResult,
  RenameProjectEntryRequest,
  WriteTextFileResult,
} from "./project-contracts.js";
import type {
  ForwardSyncRequest,
  ForwardSyncResult,
  InverseSyncRequest,
  InverseSyncResult,
} from "./synctex-contracts.js";
import type {
  GetSettingsResult,
  ProjectSettings,
  SaveGlobalSettingsResult,
  SaveProjectSettingsResult,
  ToolchainCheckRequest,
  ToolchainCheckResult,
} from "./settings-contracts.js";
import type {
  ClearLocalDataResult,
  ClearRecoveryResult,
  ExportSupportLogResult,
  GetRecoveryResult,
  SaveRecoveryRequest,
  SaveRecoveryResult,
} from "./recovery-contracts.js";

export interface TeXPulseApi {
  createProject(): Promise<OpenProjectResult>;
  createDirectory(
    request: CreateProjectEntryRequest,
  ): Promise<ProjectMutationResult>;
  createTextFile(
    request: CreateTextFileRequest,
  ): Promise<ProjectMutationResult>;
  deleteEntry(
    request: DeleteProjectEntryRequest,
  ): Promise<ProjectMutationResult>;
  exportProject(): Promise<ExportProjectResult>;
  getGitStatus(): Promise<GitStatusResult>;
  getRecentProjects(): Promise<RecentProjectsResult>;
  openProject(): Promise<OpenProjectResult>;
  openRecentProject(
    request: OpenRecentProjectRequest,
  ): Promise<OpenProjectResult>;
  openSampleProject(): Promise<OpenProjectResult>;
  readTextFile(request: ProjectPathRequest): Promise<ReadTextFileResult>;
  renameEntry(
    request: RenameProjectEntryRequest,
  ): Promise<ProjectMutationResult>;
  writeTextFile(request: ProjectWriteRequest): Promise<WriteTextFileResult>;
  compileProject(request: CompileProjectRequest): Promise<CompileProjectResult>;
  cleanBuild(request: CompileProjectRequest): Promise<CompileProjectResult>;
  cleanupAuxiliary(): Promise<CleanupAuxiliaryResult>;
  cancelBuild(): Promise<CancelBuildResult>;
  loadPdf(request: PdfArtifactRequest): Promise<LoadPdfResult>;
  openPdf(request: PdfArtifactRequest): Promise<PdfActionResult>;
  revealPdf(request: PdfArtifactRequest): Promise<PdfActionResult>;
  forwardSync(request: ForwardSyncRequest): Promise<ForwardSyncResult>;
  inverseSync(request: InverseSyncRequest): Promise<InverseSyncResult>;
  getSettings(): Promise<GetSettingsResult>;
  saveGlobalSettings(
    settings: GlobalSettings,
  ): Promise<SaveGlobalSettingsResult>;
  saveProjectSettings(
    settings: ProjectSettings,
  ): Promise<SaveProjectSettingsResult>;
  checkToolchain(request: ToolchainCheckRequest): Promise<ToolchainCheckResult>;
  saveRecovery(request: SaveRecoveryRequest): Promise<SaveRecoveryResult>;
  getRecovery(): Promise<GetRecoveryResult>;
  clearRecovery(): Promise<ClearRecoveryResult>;
  exportSupportLog(): Promise<ExportSupportLogResult>;
  clearLocalData(): Promise<ClearLocalDataResult>;
  onProjectFileChanged(
    listener: (change: ProjectFileChange) => void,
  ): () => void;
}
