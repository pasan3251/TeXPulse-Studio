import {
  buildProjectTree,
  type OutlineHeading,
  type ProjectFile,
  type ProjectSymbolIndex,
  type ProjectTreeNode,
} from "@texpulse/shared";
import { useMemo, useRef, useState } from "react";

interface SidebarPaneProps {
  files: readonly ProjectFile[];
  activeFilePath: string;
  outline: readonly OutlineHeading[];
  symbolIndex: ProjectSymbolIndex;
  projectRoot: string;
  onSelectFile: (filePath: string) => void;
  onSelectOutlineHeading: (heading: OutlineHeading) => void;
  onExportZip: () => void;
  onImportZip: (file: File) => void;
  onOpenFolder: (directoryPath: string) => void;
}

function extensionBadge(path: string): string {
  const parts = path.split(".");
  return parts.length > 1 ? (parts.at(-1) ?? "file") : "file";
}

function renderTreeNodes(
  nodes: readonly ProjectTreeNode[],
  activeFilePath: string,
  onSelectFile: (filePath: string) => void,
  depth = 0,
) {
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
          {renderTreeNodes(node.children, activeFilePath, onSelectFile, depth + 1)}
        </div>
      );
    }

    const isActive = node.path === activeFilePath;
    return (
      <button
        key={node.path}
        type="button"
        className={`tp-tree-btn${isActive ? " active" : ""}`}
        style={{ paddingLeft: `${String(10 + depth * 12)}px` }}
        onClick={() => onSelectFile(node.path)}
      >
        <span className="tp-tree-btn-label">{node.name}</span>
        <span className="tp-file-badge">{extensionBadge(node.path)}</span>
      </button>
    );
  });
}

export function SidebarPane({
  files,
  activeFilePath,
  outline,
  symbolIndex,
  projectRoot,
  onSelectFile,
  onSelectOutlineHeading,
  onExportZip,
  onImportZip,
  onOpenFolder,
}: SidebarPaneProps) {
  const [activeTab, setActiveTab] = useState<"files" | "outline">("files");
  const [folderFormOpen, setFolderFormOpen] = useState(false);
  const [folderInput, setFolderInput] = useState(projectRoot);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const tree = useMemo(
    () =>
      buildProjectTree(
        files.map((f) => ({
          path: f.path,
          kind: "file" as const,
        })),
      ),
    [files],
  );

  return (
    <aside className="tp-sidebar" aria-label="Project explorer and outline" data-testid="sidebar-pane">
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
      </div>

      <div className="tp-sidebar-content">
        {activeTab === "files" ? (
          <div>{renderTreeNodes(tree, activeFilePath, onSelectFile)}</div>
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
