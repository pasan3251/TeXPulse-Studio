import { useMemo } from "react";

import { buildProjectTree, type ProjectTreeNode } from "../project-tree.js";
import type { OpenedProject } from "../workspace-state.js";

interface ProjectExplorerProps {
  project: OpenedProject;
  activePath: string | null;
  modifiedPaths: ReadonlySet<string>;
  loadingPath: string | null;
  onOpenFile: (path: string) => void;
}

export function ProjectExplorer({
  project,
  activePath,
  modifiedPaths,
  loadingPath,
  onOpenFile,
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
      <nav className="project-tree" aria-label={`${project.name} files`}>
        <ul role="tree">
          {tree.map((node) => (
            <ProjectNode
              key={node.path}
              node={node}
              depth={0}
              activePath={activePath}
              modifiedPaths={modifiedPaths}
              loadingPath={loadingPath}
              onOpenFile={onOpenFile}
            />
          ))}
        </ul>
      </nav>
    </aside>
  );
}

interface ProjectNodeProps extends Omit<ProjectExplorerProps, "project"> {
  node: ProjectTreeNode;
  depth: number;
}

function ProjectNode({
  node,
  depth,
  activePath,
  modifiedPaths,
  loadingPath,
  onOpenFile,
}: ProjectNodeProps) {
  const isFile = node.kind === "file";
  const isLink = node.kind === "link";
  const isModified = modifiedPaths.has(node.path);
  const isLoading = loadingPath === node.path;

  return (
    <li role="treeitem" aria-selected={isFile && activePath === node.path}>
      {isFile ? (
        <button
          type="button"
          className={`tree-row ${activePath === node.path ? "active" : ""}`}
          style={{ paddingInlineStart: `${String(14 + depth * 16)}px` }}
          onClick={() => {
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
      ) : (
        <div
          className={`tree-row static ${isLink ? "link" : ""}`}
          style={{ paddingInlineStart: `${String(14 + depth * 16)}px` }}
        >
          <span className="tree-icon" aria-hidden="true">
            {isLink ? "↗" : "⌄"}
          </span>
          <span className="tree-label">{node.name}</span>
          {isLink ? <span className="tree-state">link</span> : null}
        </div>
      )}
      {node.children.length > 0 ? (
        <ul role="group">
          {node.children.map((child) => (
            <ProjectNode
              key={child.path}
              node={child}
              depth={depth + 1}
              activePath={activePath}
              modifiedPaths={modifiedPaths}
              loadingPath={loadingPath}
              onOpenFile={onOpenFile}
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
