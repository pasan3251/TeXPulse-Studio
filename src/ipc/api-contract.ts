import type {
  CancelBuildResult,
  CompileProjectRequest,
  CompileProjectResult,
  LoadPdfResult,
  PdfActionResult,
  PdfArtifactRequest,
} from "./build-contracts.js";
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

export interface TeXPulseApi {
  openProject(): Promise<OpenProjectResult>;
  readTextFile(request: ProjectPathRequest): Promise<ReadTextFileResult>;
  writeTextFile(request: ProjectWriteRequest): Promise<WriteTextFileResult>;
  compileProject(request: CompileProjectRequest): Promise<CompileProjectResult>;
  cancelBuild(): Promise<CancelBuildResult>;
  loadPdf(request: PdfArtifactRequest): Promise<LoadPdfResult>;
  openPdf(request: PdfArtifactRequest): Promise<PdfActionResult>;
  revealPdf(request: PdfArtifactRequest): Promise<PdfActionResult>;
  forwardSync(request: ForwardSyncRequest): Promise<ForwardSyncResult>;
  inverseSync(request: InverseSyncRequest): Promise<InverseSyncResult>;
  onProjectFileChanged(
    listener: (change: ProjectFileChange) => void,
  ): () => void;
}
