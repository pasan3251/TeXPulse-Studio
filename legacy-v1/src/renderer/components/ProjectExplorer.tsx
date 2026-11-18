import { useEffect, useMemo, useState, type MouseEvent } from "react";

import { buildProjectTree, type ProjectTreeNode } from "../project-tree.js";
import type { OpenedProject } from "../workspace-state.js";

export interface ProjectClipboard {
  operation: "copy" | "cut";
  sourcePath: string;
}

interface ProjectExplorerProps {
  project: OpenedProject;
  activePath: string | null;
  selectedPath: string | null;
  modifiedPaths: ReadonlySet<string>;
  loadingPath: string | null;
  clipboard: ProjectClipboard | null;
  onCopy: (path: string) => void;
  onCreateFile: (parentPath?: string) => void;
  onCreateFolder: (parentPath?: string) => void;
  onCut: (path: string) => void;
  onDelete: (path: string) => void;
  onExport: () => void;
  onOpenFile: (path: string) => void;
  onPaste: (directoryPath: string) => void;
  onRename: (path: string) => void;
  onReveal: (path: string) => void;
  onSelectEntry: (path: string | null) => void;
}

interface ContextMenuState {
  kind: "directory" | "file" | "link" | "project";
  path: string | null;
  x: number;
  y: number;
}

export function ProjectExplorer({
  project,
  activePath,
  selectedPath,
  modifiedPaths,
  loadingPath,
  clipboard,
  onCopy,
  onCreateFile,
  onCreateFolder,
  onCut,
  onDelete,
  onExport,
  onOpenFile,
  onPaste,
  onRename,
  onReveal,
  onSelectEntry,
}: ProjectExplorerProps) {
  const tree = useMemo(
    () => buildProjectTree(project.entries),
    [project.entries],
  );
  const [collapsedPaths, setCollapsedPaths] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  useEffect(() => {
    if (contextMenu === null) {
      return;
    }
    const close = () => {
      setContextMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  const openContextMenu = (
    event: MouseEvent,
    path: string | null,
    kind: ContextMenuState["kind"],
  ) => {
    event.preventDefault();
    event.stopPropagation();
    onSelectEntry(path);
    setContextMenu({
      path,
      kind,
      x: Math.min(event.clientX, Math.max(window.innerWidth - 224, 8)),
      y: Math.min(event.clientY, Math.max(window.innerHeight - 340, 8)),
    });
  };

  const selectedEntry = project.entries.find(
    (entry) => entry.path === selectedPath,
  );
  const selectedParent =
    selectedEntry?.kind === "directory"
      ? selectedEntry.path
      : parentProjectPath(selectedPath);

  return (
    <aside className="project-panel" aria-label="Project explorer">
      <div className="panel-heading explorer-heading">
        <div>
          <p className="eyebrow">Project</p>
          <h2 title={project.name}>{project.name}</h2>
        </div>
        <div className="project-actions" aria-label="Project file actions">
          <button
            type="button"
            aria-label="New file"
            title="New file"
            onClick={() => {
              onCreateFile(selectedParent);
            }}
          >
            <ActionIcon name="new-file" />
          </button>
          <button
            type="button"
            aria-label="New folder"
            title="New folder"
            onClick={() => {
              onCreateFolder(selectedParent);
            }}
          >
            <ActionIcon name="new-folder" />
          </button>
        </div>
      </div>
      <nav
        className="project-tree"
        aria-label={`${project.name} files`}
        onContextMenu={(event) => {
          openContextMenu(event, null, "project");
        }}
      >
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
              collapsedPaths={collapsedPaths}
              clipboard={clipboard}
              onOpenFile={onOpenFile}
              onSelectEntry={onSelectEntry}
              onContextMenu={openContextMenu}
              onToggle={(path) => {
                setCollapsedPaths((current) => {
                  const next = new Set(current);
                  if (next.has(path)) {
                    next.delete(path);
                  } else {
                    next.add(path);
                  }
                  return next;
                });
              }}
            />
          ))}
        </ul>
      </nav>
      {contextMenu === null ? null : (
        <ProjectContextMenu
          state={contextMenu}
          clipboard={clipboard}
          onAction={(action) => {
            const path = contextMenu.path;
            setContextMenu(null);
            if (action === "new-file") {
              onCreateFile(path ?? "");
            } else if (action === "new-folder") {
              onCreateFolder(path ?? "");
            } else if (action === "paste") {
              onPaste(path ?? "");
            } else if (action === "export") {
              onExport();
            } else if (path !== null) {
              if (action === "open") {
                onOpenFile(path);
              } else if (action === "reveal") {
                onReveal(path);
              } else if (action === "cut") {
                onCut(path);
              } else if (action === "copy") {
                onCopy(path);
              } else if (action === "rename") {
                onRename(path);
              } else if (action === "delete") {
                onDelete(path);
              }
            }
          }}
        />
      )}
    </aside>
  );
}

interface ProjectNodeProps {
  node: ProjectTreeNode;
  depth: number;
  activePath: string | null;
  selectedPath: string | null;
  modifiedPaths: ReadonlySet<string>;
  loadingPath: string | null;
  collapsedPaths: ReadonlySet<string>;
  clipboard: ProjectClipboard | null;
  onOpenFile: (path: string) => void;
  onSelectEntry: (path: string | null) => void;
  onToggle: (path: string) => void;
  onContextMenu: (
    event: MouseEvent,
    path: string | null,
    kind: ContextMenuState["kind"],
  ) => void;
}

function ProjectNode({
  node,
  depth,
  activePath,
  selectedPath,
  modifiedPaths,
  loadingPath,
  collapsedPaths,
  clipboard,
  onOpenFile,
  onSelectEntry,
  onToggle,
  onContextMenu,
}: ProjectNodeProps) {
  const isFile = node.kind === "file";
  const isLink = node.kind === "link";
  const isDirectory = node.kind === "directory";
  const isCollapsed = isDirectory && collapsedPaths.has(node.path);
  const isModified = modifiedPaths.has(node.path);
  const isLoading = loadingPath === node.path;
  const isCut =
    clipboard?.operation === "cut" && clipboard.sourcePath === node.path;

  return (
    <li
      role="treeitem"
      aria-selected={selectedPath === node.path}
      aria-expanded={isDirectory ? !isCollapsed : undefined}
    >
      {isLink ? (
        <div
          className="tree-row static link"
          style={{ paddingInlineStart: `${String(10 + depth * 16)}px` }}
          onContextMenu={(event) => {
            onContextMenu(event, node.path, "link");
          }}
        >
          <ChevronIcon hidden />
          <EntryIcon name={node.name} kind="link" expanded={false} />
          <span className="tree-label">{node.name}</span>
          <span className="tree-state">link</span>
        </div>
      ) : (
        <button
          type="button"
          className={[
            "tree-row",
            activePath === node.path ? "active" : "",
            selectedPath === node.path ? "selected" : "",
            isCut ? "cut" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={{ paddingInlineStart: `${String(10 + depth * 16)}px` }}
          onClick={() => {
            onSelectEntry(node.path);
            if (isFile) {
              onOpenFile(node.path);
            } else {
              onToggle(node.path);
            }
          }}
          onContextMenu={(event) => {
            onContextMenu(event, node.path, node.kind);
          }}
        >
          <ChevronIcon hidden={isFile} expanded={!isCollapsed} />
          <EntryIcon
            name={node.name}
            kind={node.kind}
            expanded={!isCollapsed}
          />
          <span className="tree-label">{node.name}</span>
          {isLoading ? <span className="tree-state">opening</span> : null}
          {isModified ? (
            <span className="modified-dot" aria-label="Modified">
              ●
            </span>
          ) : null}
        </button>
      )}
      {!isCollapsed && node.children.length > 0 ? (
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
              collapsedPaths={collapsedPaths}
              clipboard={clipboard}
              onOpenFile={onOpenFile}
              onSelectEntry={onSelectEntry}
              onToggle={onToggle}
              onContextMenu={onContextMenu}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

type ContextAction =
  | "copy"
  | "cut"
  | "delete"
  | "export"
  | "new-file"
  | "new-folder"
  | "open"
  | "paste"
  | "rename"
  | "reveal";

function ProjectContextMenu({
  state,
  clipboard,
  onAction,
}: {
  state: ContextMenuState;
  clipboard: ProjectClipboard | null;
  onAction: (action: ContextAction) => void;
}) {
  const isProject = state.kind === "project";
  const isDirectory = state.kind === "directory";
  const isFile = state.kind === "file";
  const canMutate = isDirectory || isFile;

  return (
    <div
      className="project-context-menu"
      role="menu"
      aria-label="Project entry actions"
      style={{ left: state.x, top: state.y }}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      {isFile ? (
        <ContextMenuButton label="Open" action="open" onAction={onAction} />
      ) : null}
      {isDirectory || isProject ? (
        <>
          <ContextMenuButton
            label="New File"
            action="new-file"
            onAction={onAction}
          />
          <ContextMenuButton
            label="New Folder"
            action="new-folder"
            onAction={onAction}
          />
        </>
      ) : null}
      {isProject ? (
        <ContextMenuButton
          label="Export Project ZIP"
          action="export"
          onAction={onAction}
        />
      ) : null}
      {state.kind !== "link" && !isProject ? (
        <ContextMenuButton
          label="Reveal in File Explorer"
          action="reveal"
          onAction={onAction}
        />
      ) : null}
      {(isDirectory || isProject) && clipboard !== null ? (
        <ContextMenuButton label="Paste" action="paste" onAction={onAction} />
      ) : null}
      {canMutate ? (
        <div className="context-separator" role="separator" />
      ) : null}
      {canMutate ? (
        <>
          <ContextMenuButton label="Cut" action="cut" onAction={onAction} />
          <ContextMenuButton label="Copy" action="copy" onAction={onAction} />
          <ContextMenuButton
            label="Rename"
            action="rename"
            onAction={onAction}
          />
          <ContextMenuButton
            label="Delete"
            action="delete"
            danger
            onAction={onAction}
          />
        </>
      ) : null}
      {state.kind === "link" ? (
        <span className="context-menu-note">Links are not traversed</span>
      ) : null}
    </div>
  );
}

function ContextMenuButton({
  label,
  action,
  danger = false,
  onAction,
}: {
  label: string;
  action: ContextAction;
  danger?: boolean;
  onAction: (action: ContextAction) => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={danger ? "danger" : undefined}
      onClick={() => {
        onAction(action);
      }}
    >
      {label}
    </button>
  );
}

function ChevronIcon({
  expanded = false,
  hidden = false,
}: {
  expanded?: boolean;
  hidden?: boolean;
}) {
  return (
    <svg
      className={`tree-chevron ${hidden ? "hidden" : ""}`}
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path
        d={expanded ? "M3.5 5.5 8 10l4.5-4.5" : "m5.5 3.5 4.5 4.5-4.5 4.5"}
      />
    </svg>
  );
}

function EntryIcon({
  name,
  kind,
  expanded,
}: {
  name: string;
  kind: ProjectTreeNode["kind"];
  expanded: boolean;
}) {
  if (kind === "directory") {
    return (
      <svg
        className="entry-icon folder-icon"
        viewBox="0 0 20 18"
        aria-hidden="true"
      >
        <path d="M1.5 3.5h6l1.7 2H18a1 1 0 0 1 1 1v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 1 15V4a.5.5 0 0 1 .5-.5Z" />
        {expanded ? (
          <path className="folder-highlight" d="M2 7h17l-2 9H2Z" />
        ) : null}
      </svg>
    );
  }
  if (kind === "link") {
    return (
      <svg
        className="entry-icon link-icon"
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        <path d="M7.2 12.8 5.6 14.4a2.8 2.8 0 0 1-4-4l2.8-2.8a2.8 2.8 0 0 1 4 0M12.8 7.2l1.6-1.6a2.8 2.8 0 1 1 4 4l-2.8 2.8a2.8 2.8 0 0 1-4 0M6.8 13.2l6.4-6.4" />
      </svg>
    );
  }

  const extension = name.split(".").at(-1)?.toLowerCase() ?? "";
  const icon = fileIconDetails(extension);
  return (
    <svg
      className={`entry-icon file-icon file-icon-${icon.tone}`}
      viewBox="0 0 18 20"
      aria-hidden="true"
    >
      <path className="file-sheet" d="M3 1h7l5 5v13H3Z" />
      <path className="file-fold" d="M10 1v5h5" />
      <text x="9" y="15" textAnchor="middle">
        {icon.label}
      </text>
    </svg>
  );
}

function ActionIcon({ name }: { name: "new-file" | "new-folder" }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      {name === "new-file" ? (
        <>
          <path d="M4 2h7l4 4v11H4Z" />
          <path d="M11 2v4h4M10 9v6M7 12h6" />
        </>
      ) : (
        <>
          <path d="M2 5h6l1.5 2H18v9H2Z" />
          <path d="M10 9v5M7.5 11.5h5" />
        </>
      )}
    </svg>
  );
}

function fileIconDetails(extension: string): { label: string; tone: string } {
  if (extension === "tex") {
    return { label: "T", tone: "tex" };
  }
  if (extension === "bib") {
    return { label: "B", tone: "bib" };
  }
  if (extension === "sty" || extension === "cls") {
    return { label: "L", tone: "latex" };
  }
  if (extension === "pdf") {
    return { label: "P", tone: "pdf" };
  }
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(extension)) {
    return { label: "I", tone: "image" };
  }
  if (["json", "yaml", "yml"].includes(extension)) {
    return { label: "{}", tone: "config" };
  }
  if (extension === "md") {
    return { label: "M", tone: "markdown" };
  }
  if (["ts", "tsx", "js", "jsx"].includes(extension)) {
    return { label: "JS", tone: "code" };
  }
  return { label: "", tone: "plain" };
}

function parentProjectPath(path: string | null): string {
  if (path === null) {
    return "";
  }
  const separator = path.lastIndexOf("/");
  return separator === -1 ? "" : path.slice(0, separator);
}
