import type { Tree } from "@lezer/common";
import type {
  ActiveMathBlock,
  CursorScope,
  EditorDiagnostic,
  IDocumentContextProvider,
  ProjectSymbolIndex,
  SyntaxTreeNodeSummary,
  SyntaxTreeSnapshot,
} from "@texpulse/shared";

export interface DocumentContextStateInput {
  filePath: string;
  docText: string;
  cursorOffset: number;
  selectedText: string;
  syntaxTree: Tree | null;
  projectSymbols: ProjectSymbolIndex;
  diagnostics: readonly EditorDiagnostic[];
  activeMathBlock: ActiveMathBlock | null;
}

function computeLineAndColumn(docText: string, offset: number): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(offset, docText.length));
  const before = docText.slice(0, clamped);
  const lastNewline = before.lastIndexOf("\n");
  const line = before.split("\n").length;
  const column = lastNewline === -1 ? clamped + 1 : clamped - lastNewline;
  return { line, column };
}

function extractCurrentSection(docText: string, offset: number): string | null {
  const before = docText.slice(0, offset);
  const matches = [
    ...before.matchAll(/\\(?:part|chapter|section|subsection|subsubsection)\*?\{([^{}]*)\}/gu),
  ];
  const latest = matches.at(-1)?.[1]?.trim();
  return latest && latest.length > 0 ? latest : null;
}

function extractActiveEnvironment(docText: string, offset: number): string | null {
  const before = docText.slice(0, offset);
  const stack: string[] = [];
  const envTokens = before.matchAll(/\\(begin|end)\{([a-zA-Z0-9*+@]+)\}/gu);
  for (const token of envTokens) {
    const kind = token[1];
    const name = token[2];
    if (!name) continue;
    if (kind === "begin") {
      stack.push(name);
    } else if (kind === "end") {
      const idx = stack.lastIndexOf(name);
      if (idx !== -1) {
        stack.splice(idx, 1);
      }
    }
  }
  return stack.at(-1) ?? null;
}

function extractSurroundingLines(docText: string, zeroBasedLine: number, radius = 2): string {
  const lines = docText.split(/\r?\n/u);
  const start = Math.max(0, zeroBasedLine - radius);
  const end = Math.min(lines.length, zeroBasedLine + radius + 1);
  return lines.slice(start, end).join("\n");
}

function summarizeTree(tree: Tree | null, offset: number): SyntaxTreeSnapshot {
  if (tree === null) {
    return {
      length: 0,
      topNodeName: "None",
      cursorNodeName: "None",
      nodeCount: 0,
      rawTree: null,
      nodes: [],
    };
  }

  const nodes: SyntaxTreeNodeSummary[] = [];
  let nodeCount = 0;
  tree.iterate({
    enter(node) {
      nodeCount += 1;
      if (nodes.length < 150) {
        nodes.push({ name: node.name, from: node.from, to: node.to });
      }
    },
  });

  const cursorNode = tree.resolveInner(offset, -1);

  return {
    length: tree.length,
    topNodeName: tree.topNode.name,
    cursorNodeName: cursorNode.name,
    nodeCount,
    rawTree: tree,
    nodes,
  };
}

/**
 * Version 1.0 local document intelligence substrate and Version 2.0 AI
 * integration seam (`IDocumentContextProvider`). Zero external AI calls.
 */
export class DocumentContextProvider implements IDocumentContextProvider {
  private input: DocumentContextStateInput;

  constructor(initialInput: DocumentContextStateInput) {
    this.input = initialInput;
  }

  update(nextInput: DocumentContextStateInput): void {
    this.input = nextInput;
  }

  getSyntaxTree(): SyntaxTreeSnapshot {
    return summarizeTree(this.input.syntaxTree, this.input.cursorOffset);
  }

  getCursorScope(): CursorScope {
    const { line, column } = computeLineAndColumn(
      this.input.docText,
      this.input.cursorOffset,
    );
    return {
      filePath: this.input.filePath,
      line,
      column,
      offset: this.input.cursorOffset,
      currentSection: extractCurrentSection(this.input.docText, this.input.cursorOffset),
      activeEnvironment: extractActiveEnvironment(this.input.docText, this.input.cursorOffset),
      surroundingLines: extractSurroundingLines(this.input.docText, line - 1),
      selectedText: this.input.selectedText,
      activeMathBlock: this.input.activeMathBlock,
    };
  }

  getProjectSymbols(): ProjectSymbolIndex {
    return this.input.projectSymbols;
  }

  getDiagnostics(): readonly EditorDiagnostic[] {
    return this.input.diagnostics;
  }
}
