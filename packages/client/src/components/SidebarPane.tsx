import {
  buildProjectTree,
  type OutlineHeading,
  type ProjectAssetFile,
  type ProjectFile,
  type ProjectSymbolIndex,
  type ProjectTreeNode,
} from "@texpulse/shared";
import { useMemo, useRef, useState } from "react";

interface SidebarPaneProps {
  files: readonly ProjectFile[];
  assets: readonly ProjectAssetFile[];
  activeFilePath: string;
  outline: readonly OutlineHeading[];
  symbolIndex: ProjectSymbolIndex;
  projectRoot: string;
  widthPx?: number | undefined;
  fileActionError?: string | null | undefined;
  onSelectFile: (filePath: string) => void;
  onInsertAssetSnippet: (assetPath: string) => void;
  onCreateFile: (filePath: string) => void;
  onUploadFiles: (files: readonly File[]) => void;
  onDeleteFile: (filePath: string) => void;
  onSelectOutlineHeading: (heading: OutlineHeading) => void;
  onExportZip: () => void;
  onImportZip: (file: File) => void;
  onOpenFolder: (directoryPath: string) => void;
}

function extensionBadge(path: string, isAsset: boolean): string {
  if (isAsset) {
    const ext = path.split(".").at(-1)?.toLowerCase() ?? "fig";
    return ext;
  }
  const parts = path.split(".");
  return parts.length > 1 ? (parts.at(-1) ?? "file") : "file";
}

interface TreeRenderParams {
  nodes: readonly ProjectTreeNode[];
  activeFilePath: string;
  assetPaths: ReadonlySet<string>;
  confirmDeletePath: string | null;
  onSelectFile: (filePath: string) => void;
  onInsertAssetSnippet: (assetPath: string) => void;
  onRequestDelete: (path: string) => void;
  onConfirmDelete: (path: string) => void;
  onCancelDelete: () => void;
  depth?: number;
}

function renderTreeNodes({
  nodes,
  activeFilePath,
  assetPaths,
  confirmDeletePath,
  onSelectFile,
  onInsertAssetSnippet,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
  depth = 0,
}: TreeRenderParams) {
  return nodes.map((node) => {
    if (node.kind === "directory") {
      return (
        <div key={node.path}>
          <div
            className="tp-tree-folder"
            style={{ paddingLeft: `${String(8 + depth * 12)}px` }}
          >
            <span>▾</span>
            <span>{node.name}</span>
          </div>
          {renderTreeNodes({
            nodes: node.children,
            activeFilePath,
            assetPaths,
            confirmDeletePath,
            onSelectFile,
            onInsertAssetSnippet,
            onRequestDelete,
            onConfirmDelete,
            onCancelDelete,
            depth: depth + 1,
          })}
        </div>
      );
    }

    const isAsset = assetPaths.has(node.path);
    const isActive = !isAsset && node.path === activeFilePath;
    const isConfirming = confirmDeletePath === node.path;

    return (
      <div
        key={node.path}
        className={`tp-tree-row${isActive ? " active" : ""}`}
        data-testid={`tree-row-${node.path}`}
      >
        {isConfirming ? (
          <div
            className="tp-tree-confirm-row"
            style={{ paddingLeft: `${String(10 + depth * 12)}px` }}
          >
            <span className="tp-tree-btn-label">{node.name}</span>
            <div className="tp-tree-confirm-actions">
              <button
                type="button"
                className="tp-tree-confirm-btn danger"
                data-testid="confirm-delete-file-btn"
                onClick={() => onConfirmDelete(node.path)}
              >
                Delete
              </button>
              <button
                type="button"
                className="tp-tree-confirm-btn"
                onClick={onCancelDelete}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              className={`tp-tree-btn${isActive ? " active" : ""}`}
              style={{ paddingLeft: `${String(10 + depth * 12)}px` }}
              data-testid={isAsset ? `asset-item-${node.path}` : `file-item-${node.path}`}
              title={
                isAsset
                  ? `Click to insert \\includegraphics[width=0.8\\textwidth]{${node.path}}`
                  : node.path
              }
              onClick={() => {
                if (isAsset) {
                  onInsertAssetSnippet(node.path);
                } else {
                  onSelectFile(node.path);
                }
              }}
            >
              <span className="tp-tree-btn-label">{node.name}</span>
              <span className={`tp-file-badge${isAsset ? " asset" : ""}`}>
                {extensionBadge(node.path, isAsset)}
              </span>
            </button>
            <button
              type="button"
              className="tp-tree-delete-btn"
              data-testid={`delete-file-${node.path}`}
              aria-label={`Delete ${node.path}`}
              title={`Delete ${node.path}`}
              onClick={(event) => {
                event.stopPropagation();
                onRequestDelete(node.path);
              }}
            >
              ×
            </button>
          </>
        )}
      </div>
    );
  });
}

export function SidebarPane({
  files,
  assets,
  activeFilePath,
  outline,
  symbolIndex,
  projectRoot,
  widthPx = 240,
  fileActionError = null,
  onSelectFile,
  onInsertAssetSnippet,
  onCreateFile,
  onUploadFiles,
  onDeleteFile,
  onSelectOutlineHeading,
  onExportZip,
  onImportZip,
  onOpenFolder,
}: SidebarPaneProps) {
  const [activeTab, setActiveTab] = useState<"files" | "outline">("files");
  const [newFileFormOpen, setNewFileFormOpen] = useState(false);
  const [newFileInput, setNewFileInput] = useState("");
  const [confirmDeletePath, setConfirmDeletePath] = useState<string | null>(null);
  const [dragOverTree, setDragOverTree] = useState(false);
  const [folderFormOpen, setFolderFormOpen] = useState(false);
  const [folderInput, setFolderInput] = useState(projectRoot);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const assetUploadInputRef = useRef<HTMLInputElement>(null);

  const assetPaths = useMemo(
    () => new Set(assets.map((asset) => asset.path)),
    [assets],
  );

  const tree = useMemo(
    () =>
      buildProjectTree([
        ...files.map((f) => ({
          path: f.path,
          kind: "file" as const,
        })),
        ...assets.map((a) => ({
          path: a.path,
          kind: "file" as const,
        })),
      ]),
    [assets, files],
  );

  return (
    <aside
      className="tp-sidebar"
      aria-label="Project explorer and outline"
      data-testid="sidebar-pane"
      style={{ width: `${String(widthPx)}px`, flexBasis: `${String(widthPx)}px` }}
    >
      <div className="tp-sidebar-header">
        <div className="tp-sidebar-tabs" role="tablist" aria-label="Sidebar mode">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "files"}
            className={`tp-sidebar-tab${activeTab === "files" ? " active" : ""}`}
            onClick={() => setActiveTab("files")}
          >
            Files
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "outline"}
            className={`tp-sidebar-tab${activeTab === "outline" ? " active" : ""}`}
            onClick={() => setActiveTab("outline")}
          >
            Outline ({String(outline.length)})
          </button>
        </div>

        {activeTab === "files" ? (
          <div className="tp-sidebar-toolbar">
            <button
              type="button"
              className="tp-sidebar-mini-btn"
              data-testid="new-file-button"
              onClick={() => {
                setConfirmDeletePath(null);
                setNewFileFormOpen((open) => !open);
              }}
              title="Create new .tex or .bib file"
            >
              + File
            </button>
            <button
              type="button"
              className="tp-sidebar-mini-btn"
              data-testid="upload-asset-button"
              onClick={() => assetUploadInputRef.current?.click()}
              title="Upload figure (.png, .jpg, .pdf, .eps, .svg) or source file"
            >
              + Upload
            </button>
            <input
              ref={assetUploadInputRef}
              type="file"
              multiple
              accept=".png,.jpg,.jpeg,.pdf,.eps,.svg,.tex,.bib,.sty,.cls"
              style={{ display: "none" }}
              data-testid="upload-asset-input"
              onChange={(event) => {
                const picked = event.target.files ? Array.from(event.target.files) : [];
                if (picked.length > 0) {
                  onUploadFiles(picked);
                }
                event.target.value = "";
              }}
            />
          </div>
        ) : null}
      </div>

      {activeTab === "files" && newFileFormOpen ? (
        <form
          className="tp-new-file-form"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = newFileInput.trim();
            if (!trimmed) return;
            onCreateFile(trimmed);
            setNewFileInput("");
            setNewFileFormOpen(false);
          }}
        >
          <input
            type="text"
            className="tp-folder-input"
            data-testid="new-file-input"
            value={newFileInput}
            onChange={(event) => setNewFileInput(event.target.value)}
            placeholder="chapters/conclusion.tex"
            aria-label="New project file path"
            autoFocus
          />
          <button
            type="submit"
            className="tp-sidebar-mini-btn active"
            data-testid="create-file-submit"
          >
            Add
          </button>
        </form>
      ) : null}

      {fileActionError ? (
        <div className="tp-file-error" role="alert">
          {fileActionError}
        </div>
      ) : null}

      <div
        className={`tp-sidebar-content${dragOverTree && activeTab === "files" ? " is-drag-over" : ""}`}
        data-testid="sidebar-file-tree"
        onDragOver={(event) => {
          if (activeTab !== "files") return;
          if (Array.from(event.dataTransfer.types).includes("Files")) {
            event.preventDefault();
            setDragOverTree(true);
          }
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setDragOverTree(false);
        }}
        onDrop={(event) => {
          if (activeTab !== "files") return;
          event.preventDefault();
          setDragOverTree(false);
          const dropped = Array.from(event.dataTransfer.files);
          if (dropped.length > 0) {
            onUploadFiles(dropped);
          }
        }}
      >
        {activeTab === "files" ? (
          <>
            {dragOverTree ? (
              <div className="tp-drop-hint">Drop figures (.png/.jpg/.pdf) or .tex files</div>
            ) : null}
            <div>
              {renderTreeNodes({
                nodes: tree,
                activeFilePath,
                assetPaths,
                confirmDeletePath,
                onSelectFile,
                onInsertAssetSnippet,
                onRequestDelete: (path) => setConfirmDeletePath(path),
                onConfirmDelete: (path) => {
                  setConfirmDeletePath(null);
                  onDeleteFile(path);
                },
                onCancelDelete: () => setConfirmDeletePath(null),
              })}
            </div>
          </>
        ) : outline.length === 0 ? (
          <div className="tp-pdf-placeholder-desc" style={{ padding: "12px 8px" }}>
            No \section headings detected in {activeFilePath}.
          </div>
        ) : (
          <div>
            {outline.map((heading) => (
              <button
                key={heading.id}
                type="button"
                className="tp-tree-btn"
                style={{ paddingLeft: `${String(8 + (heading.level - 1) * 10)}px` }}
                onClick={() => onSelectOutlineHeading(heading)}
              >
                <span className="tp-tree-btn-label">{heading.title}</span>
                <span className="tp-outline-line">L{String(heading.line)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="tp-sidebar-footer">
        <div className="tp-sidebar-stats">
          <span>{String(symbolIndex.labels.length)} labels</span>
          <span>{String(symbolIndex.citations.length)} citations</span>
        </div>
        <div className="tp-sidebar-actions">
          <button
            type="button"
            className="tp-sidebar-action-btn"
            data-testid="export-zip-button"
            onClick={onExportZip}
            title="Export project as Overleaf-compatible .zip"
          >
            Export .zip
          </button>
          <button
            type="button"
            className="tp-sidebar-action-btn"
            data-testid="import-zip-button"
            onClick={() => zipInputRef.current?.click()}
            title="Import Overleaf .zip archive"
          >
            Import .zip
          </button>
          <button
            type="button"
            className="tp-sidebar-action-btn"
            data-testid="open-folder-button"
            onClick={() => {
              setFolderInput(projectRoot);
              setFolderFormOpen((open) => !open);
            }}
            title="Switch local workspace directory"
          >
            Folder
          </button>
          <input
            ref={zipInputRef}
            type="file"
            accept=".zip,application/zip"
            style={{ display: "none" }}
            data-testid="import-zip-input"
            onChange={(event) => {
              const selected = event.target.files?.[0];
              if (selected) {
                onImportZip(selected);
              }
              event.target.value = "";
            }}
          />
        </div>
        {folderFormOpen ? (
          <form
            className="tp-folder-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (folderInput.trim()) {
                onOpenFolder(folderInput.trim());
                setFolderFormOpen(false);
              }
            }}
          >
            <input
              type="text"
              className="tp-folder-input"
              data-testid="folder-path-input"
              value={folderInput}
              onChange={(event) => setFolderInput(event.target.value)}
              placeholder="C:\path\to\latex-project"
              aria-label="Local project directory path"
            />
            <button type="submit" className="tp-sidebar-action-btn" style={{ flex: "0 0 auto" }}>
              Open
            </button>
          </form>
        ) : null}
      </div>
    </aside>
  );
}
