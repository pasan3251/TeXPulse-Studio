import type { OpenedProject } from "./workspace-state.js";

export type ProjectTreeEntry = OpenedProject["entries"][number];

export interface ProjectTreeNode {
  name: string;
  path: string;
  kind: ProjectTreeEntry["kind"];
  children: ProjectTreeNode[];
}

interface MutableProjectTreeNode extends ProjectTreeNode {
  children: MutableProjectTreeNode[];
}

export function buildProjectTree(
  entries: readonly ProjectTreeEntry[],
): ProjectTreeNode[] {
  const roots: MutableProjectTreeNode[] = [];
  const nodes = new Map<string, MutableProjectTreeNode>();

  for (const entry of entries) {
    const parts = entry.path.split("/");
    let parentChildren = roots;
    let currentPath = "";

    parts.forEach((part, index) => {
      currentPath = currentPath === "" ? part : `${currentPath}/${part}`;
      const existing = nodes.get(currentPath);
      if (existing !== undefined) {
        parentChildren = existing.children;
        return;
      }

      const isEntry = index === parts.length - 1;
      const node: MutableProjectTreeNode = {
        name: part,
        path: currentPath,
        kind: isEntry ? entry.kind : "directory",
        children: [],
      };
      nodes.set(currentPath, node);
      parentChildren.push(node);
      parentChildren = node.children;
    });
  }

  sortNodes(roots);
  return roots;
}

function sortNodes(nodes: MutableProjectTreeNode[]): void {
  nodes.sort(
    (left, right) =>
      Number(right.kind === "directory") - Number(left.kind === "directory") ||
      left.name.localeCompare(right.name),
  );
  for (const node of nodes) {
    sortNodes(node.children);
  }
}
