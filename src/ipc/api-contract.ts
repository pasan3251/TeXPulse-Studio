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
  OpenProjectResult,
  ProjectFileChange,
  ProjectPathRequest,
  ProjectWriteRequest,
  ReadTextFileResult,
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

export interface TeXPulseApi {
  openProject(): Promise<OpenProjectResult>;
  readTextFile(request: ProjectPathRequest): Promise<ReadTextFileResult>;
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
  onProjectFileChanged(
    listener: (change: ProjectFileChange) => void,
  ): () => void;
}
