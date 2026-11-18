import type {
  ProjectFileKind,
  ProjectTreeEntryInput,
  ProjectTreeNode,
  RootCandidate,
} from "./index.js";

interface MutableProjectTreeNode extends ProjectTreeNode {
  children: MutableProjectTreeNode[];
}

const ROOT_NAMES = new Set(["main.tex", "root.tex", "thesis.tex"]);

/**
 * Infers the logical LaTeX workspace file kind from a relative file path.
 */
export function inferProjectFileKind(path: string): ProjectFileKind {
  const lower = path.toLowerCase();
  if (lower.endsWith(".tex")) return "tex";
  if (lower.endsWith(".bib")) return "bib";
  if (lower.endsWith(".sty")) return "sty";
  if (lower.endsWith(".cls")) return "cls";
  return "other";
}

/**
 * Converts a flat list of normalized portable paths into a directory-first
 * hierarchical file tree (salvaged from v1 project-tree.ts).
 */
export function buildProjectTree(
  entries: readonly ProjectTreeEntryInput[],
): ProjectTreeNode[] {
  const roots: MutableProjectTreeNode[] = [];
  const nodes = new Map<string, MutableProjectTreeNode>();

  for (const entry of entries) {
    const parts = entry.path.split("/").filter((part) => part !== "");
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

/**
 * Ranks `.tex` files by likelihood of being the root document (salvaged from v1
 * root-detection.ts).
 */
export function rankRootCandidates(
  files: ReadonlyArray<{ path: string; content: string }>,
): RootCandidate[] {
  const candidates: RootCandidate[] = [];
  for (const file of files) {
    if (!file.path.toLowerCase().endsWith(".tex")) {
      continue;
    }

    const reasons: string[] = [];
    let score = 0;
    if (/\\documentclass\s*(?:\[[^\]]*\])?\s*\{[^}]+\}/u.test(file.content)) {
      score += 100;
      reasons.push("contains documentclass");
    }
    if (/\\begin\s*\{document\}/u.test(file.content)) {
      score += 40;
      reasons.push("contains document environment");
    }
    const name = file.path.split("/").at(-1)?.toLowerCase();
    if (name !== undefined && ROOT_NAMES.has(name)) {
      score += 20;
      reasons.push("uses a conventional root filename");
    }
    if (score > 0) {
      candidates.push({ path: file.path, score, reasons });
    }
  }

  return candidates.sort(
    (left, right) =>
      right.score - left.score || left.path.localeCompare(right.path),
  );
}
