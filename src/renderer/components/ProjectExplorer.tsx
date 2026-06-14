import { useMemo } from "react";

import { buildProjectTree, type ProjectTreeNode } from "../project-tree.js";
import type { OpenedProject } from "../workspace-state.js";

interface ProjectExplorerProps {
  project: OpenedProject;
  activePath: string | null;
  selectedPath: string | null;
  modifiedPaths: ReadonlySet<string>;
  loadingPath: string | null;
  onCreateFile: () => void;
  onCreateFolder: () => void;
  onDelete: () => void;
  onExport: () => void;
  onOpenFile: (path: string) => void;
  onRename: () => void;
  onSelectEntry: (path: string) => void;
}

export function ProjectExplorer({
  project,
  activePath,
  selectedPath,
  modifiedPaths,
  loadingPath,
  onCreateFile,
  onCreateFolder,
  onDelete,
  onExport,
  onOpenFile,
  onRename,
  onSelectEntry,
}: ProjectExplorerProps) {
  const tree = useMemo(
    () => buildProjectTree(project.entries),
    [project.entries],
  );

  return (
    <aside className="project-panel" aria-label="Project explorer">
      <div className="panel-heading">
        <p className="eyebrow">Project</p>
        <h2 title={project.name}>{project.name}</h2>
      </div>
      <div className="project-actions" aria-label="Project file actions">
        <button type="button" onClick={onCreateFile}>
          New file
        </button>
        <button type="button" onClick={onCreateFolder}>
          New folder
        </button>
        <button
          type="button"
          disabled={selectedPath === null}
          onClick={onRename}
        >
          Rename
        </button>
        <button
          type="button"
          disabled={selectedPath === null}
          onClick={onDelete}
        >
          Delete
        </button>
        <button type="button" onClick={onExport}>
          Export ZIP
        </button>
      </div>
      <nav className="project-tree" aria-label={`${project.name} files`}>
        <ul role="tree">
          {tree.map((node) => (
            <ProjectNode
              key={node.path}
              node={node}
              depth={0}
              activePath={activePath}
              selectedPath={selectedPath}
              modifiedPaths={modifiedPaths}
              loadingPath={loadingPath}
              onOpenFile={onOpenFile}
              onSelectEntry={onSelectEntry}
            />
          ))}
        </ul>
      </nav>
    </aside>
  );
}

interface ProjectNodeProps
  extends Omit<
    ProjectExplorerProps,
    | "project"
    | "onCreateFile"
    | "onCreateFolder"
    | "onDelete"
    | "onExport"
    | "onRename"
  > {
  node: ProjectTreeNode;
  depth: number;
}

function ProjectNode({
  node,
  depth,
  activePath,
  selectedPath,
  modifiedPaths,
  loadingPath,
  onOpenFile,
  onSelectEntry,
}: ProjectNodeProps) {
  const isFile = node.kind === "file";
  const isLink = node.kind === "link";
  const isModified = modifiedPaths.has(node.path);
  const isLoading = loadingPath === node.path;

  return (
    <li role="treeitem" aria-selected={selectedPath === node.path}>
      {isFile ? (
        <button
          type="button"
          className={`tree-row ${activePath === node.path ? "active" : ""} ${
            selectedPath === node.path ? "selected" : ""
          }`}
          style={{ paddingInlineStart: `${String(14 + depth * 16)}px` }}
          onClick={() => {
            onSelectEntry(node.path);
            onOpenFile(node.path);
          }}
        >
          <span className="tree-icon" aria-hidden="true">
            {fileGlyph(node.name)}
          </span>
          <span className="tree-label">{node.name}</span>
          {isLoading ? <span className="tree-state">opening</span> : null}
          {isModified ? (
            <span className="modified-dot" aria-label="Modified">
              ●
            </span>
          ) : null}
        </button>
      ) : isLink ? (
        <div
          className="tree-row static link"
          style={{ paddingInlineStart: `${String(14 + depth * 16)}px` }}
        >
          <span className="tree-icon" aria-hidden="true">
            ↗
          </span>
          <span className="tree-label">{node.name}</span>
          <span className="tree-state">link</span>
        </div>
      ) : (
        <button
          type="button"
          className={`tree-row ${selectedPath === node.path ? "selected" : ""}`}
          style={{ paddingInlineStart: `${String(14 + depth * 16)}px` }}
          onClick={() => {
            onSelectEntry(node.path);
          }}
        >
          <span className="tree-icon" aria-hidden="true">
            ⌄
          </span>
          <span className="tree-label">{node.name}</span>
        </button>
      )}
      {node.children.length > 0 ? (
        <ul role="group">
          {node.children.map((child) => (
            <ProjectNode
              key={child.path}
              node={child}
              depth={depth + 1}
              activePath={activePath}
              selectedPath={selectedPath}
              modifiedPaths={modifiedPaths}
              loadingPath={loadingPath}
              onOpenFile={onOpenFile}
              onSelectEntry={onSelectEntry}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function fileGlyph(fileName: string): string {
  const extension = fileName.split(".").at(-1)?.toLowerCase();
  if (extension === "tex") {
    return "T";
  }
  if (extension === "bib") {
    return "B";
  }
  return "·";
}
