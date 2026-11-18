import type { Tree } from "@lezer/common";
import type { OutlineHeading } from "@texpulse/shared";

const HEADING_NODE_LEVELS: Readonly<Record<string, 1 | 2 | 3 | 4>> = {
  Part: 1,
  Chapter: 1,
  Section: 2,
  SubSection: 3,
  SubSubSection: 4,
};

const HEADING_COMMAND_PATTERN =
  /\\(part|chapter|section|subsection|subsubsection)\*?\{([^{}]*)\}/gu;

function lineAtOffset(docText: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < docText.length; i += 1) {
    if (docText.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

/**
 * Extracts document section outline headings directly from the live Lezer AST,
 * falling back to brace title extraction inside matched command nodes.
 */
export function extractOutlineFromTree(
  docText: string,
  tree: Tree | null,
): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  const seenOffsets = new Set<number>();

  if (tree !== null) {
    tree.iterate({
      enter(node) {
        const mappedLevel = HEADING_NODE_LEVELS[node.name];
        if (mappedLevel === undefined) return;

        const slice = docText.slice(node.from, Math.min(node.to, node.from + 240));
        const match = /\\([a-zA-Z]+)\*?\{([^{}]*)\}/u.exec(slice);
        if (match === null) return;

        const command = match[1] ?? node.name.toLowerCase();
        const title = (match[2] ?? "").replace(/\s+/gu, " ").trim();
        if (!title) return;

        seenOffsets.add(node.from);
        headings.push({
          id: `${command}-${String(node.from)}`,
          level: mappedLevel,
          title,
          command,
          line: lineAtOffset(docText, node.from),
          from: node.from,
        });
        return false;
      },
    });
  }

  if (headings.length > 0) {
    return headings;
  }

  // Fallback scan when syntax tree is still mid-edit before closing document
  for (const match of docText.matchAll(HEADING_COMMAND_PATTERN)) {
    const index = match.index ?? 0;
    if (seenOffsets.has(index)) continue;
    const command = (match[1] ?? "section").toLowerCase();
    const title = (match[2] ?? "").replace(/\s+/gu, " ").trim();
    if (!title) continue;
    const level: 1 | 2 | 3 | 4 =
      command === "part" || command === "chapter"
        ? 1
        : command === "section"
          ? 2
          : command === "subsection"
            ? 3
            : 4;
    headings.push({
      id: `${command}-${String(index)}`,
      level,
      title,
      command,
      line: lineAtOffset(docText, index),
      from: index,
    });
  }

  return headings;
}
