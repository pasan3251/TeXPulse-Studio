import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNode, Tree } from "@lezer/common";
import type { ActiveMathBlock } from "@texpulse/shared";

const DISPLAY_MATH_ENVS = new Set([
  "equation",
  "equation*",
  "align",
  "align*",
  "alignat",
  "alignat*",
  "gather",
  "gather*",
  "multline",
  "multline*",
  "eqnarray",
  "eqnarray*",
  "flalign",
  "flalign*",
]);

const ALIGNED_WRAP_ENVS = new Set([
  "align",
  "align*",
  "alignat",
  "alignat*",
  "eqnarray",
  "eqnarray*",
  "flalign",
  "flalign*",
]);

const GATHERED_WRAP_ENVS = new Set(["gather", "gather*"]);

function lineNumberAt(docText: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < docText.length; i += 1) {
    if (docText.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

/**
 * Normalizes extracted LaTeX math for KaTeX rendering: strips `\label{...}`
 * and `\notag`/`\nonumber` markers and wraps `align` environments in `aligned`.
 */
export function prepareLatexForKatex(
  rawBody: string,
  envName: string,
): string {
  const cleaned = rawBody
    .replace(/\\label\{[^}]*\}/gu, "")
    .replace(/\\(?:notag|nonumber)\b/gu, "")
    .trim();

  if (cleaned === "") return "";
  if (ALIGNED_WRAP_ENVS.has(envName)) {
    return `\\begin{aligned}\n${cleaned}\n\\end{aligned}`;
  }
  if (GATHERED_WRAP_ENVS.has(envName)) {
    return `\\begin{gathered}\n${cleaned}\n\\end{gathered}`;
  }
  return cleaned;
}

function findEnclosingAstMathNode(
  tree: Tree,
  cursorPos: number,
): { node: SyntaxNode; kind: "env" | "bracket" | "paren" | "dollar" } | null {
  let cursor: SyntaxNode | null = tree.resolveInner(cursorPos, -1);
  // Check right side if cursor is directly after opening delimiter
  if (cursor.name === "LaTeX" || cursor.name === "Text") {
    cursor = tree.resolveInner(cursorPos, 1);
  }

  let current: SyntaxNode | null = cursor;
  while (current !== null) {
    if (
      current.name === "EquationEnvironment" ||
      current.name === "EquationArrayEnvironment"
    ) {
      return { node: current, kind: "env" };
    }
    if (current.name === "BracketMath") {
      return { node: current, kind: "bracket" };
    }
    if (current.name === "ParenMath") {
      return { node: current, kind: "paren" };
    }
    if (current.name === "DollarMath" || current.name === "InlineMath") {
      return { node: current, kind: "dollar" };
    }
    current = current.parent;
  }
  return null;
}

function findMathDelimiterFallback(
  docText: string,
  cursorPos: number,
): ActiveMathBlock | null {
  // 1. Check enclosing \begin{env} ... \end{env}
  const envOpenRe = /\\begin\{([a-zA-Z0-9*+@]+)\}/gu;
  let bestEnv: ActiveMathBlock | null = null;
  for (const match of docText.matchAll(envOpenRe)) {
    const envName = match[1] ?? "";
    if (!DISPLAY_MATH_ENVS.has(envName)) continue;
    const start = match.index ?? 0;
    const bodyStart = start + match[0].length;
    if (cursorPos < start) continue;

    const endTag = `\\end{${envName}}`;
    const endIdx = docText.indexOf(endTag, bodyStart);
    const blockEnd = endIdx === -1 ? docText.length : endIdx + endTag.length;
    const bodyEnd = endIdx === -1 ? docText.length : endIdx;

    if (cursorPos >= start && cursorPos <= blockEnd) {
      const inner = docText.slice(bodyStart, bodyEnd);
      bestEnv = {
        latex: prepareLatexForKatex(inner, envName),
        displayMode: true,
        delimiter: envName,
        from: start,
        to: blockEnd,
        line: lineNumberAt(docText, start),
      };
    }
  }
  if (bestEnv !== null) return bestEnv;

  // 2. Check $$...$$ display math spans
  let idx = 0;
  while (idx < docText.length) {
    const ch = docText[idx];
    if (ch === "%") {
      const nl = docText.indexOf("\n", idx);
      idx = nl === -1 ? docText.length : nl + 1;
      continue;
    }
    if (ch === "\\" && docText[idx + 1] === "$") {
      idx += 2;
      continue;
    }
    if (ch === "$" && docText[idx + 1] === "$") {
      const start = idx;
      const close = docText.indexOf("$$", start + 2);
      const end = close === -1 ? docText.length : close + 2;
      if (cursorPos > start && cursorPos < end) {
        const inner = docText.slice(start + 2, close === -1 ? docText.length : close);
        return {
          latex: prepareLatexForKatex(inner, "$$"),
          displayMode: true,
          delimiter: "$$",
          from: start,
          to: end,
          line: lineNumberAt(docText, start),
        };
      }
      idx = end;
      continue;
    }
    if (ch === "$") {
      const start = idx;
      let close = start + 1;
      while (close < docText.length) {
        if (docText[close] === "\\") {
          close += 2;
          continue;
        }
        if (docText[close] === "$") break;
        if (docText[close] === "\n" && docText[close + 1] === "\n") {
          close = -1;
          break;
        }
        close += 1;
      }
      if (close > start && close < docText.length && docText[close] === "$") {
        const end = close + 1;
        if (cursorPos >= start && cursorPos <= end) {
          const inner = docText.slice(start + 1, close);
          return {
            latex: prepareLatexForKatex(inner, "$"),
            displayMode: false,
            delimiter: "$",
            from: start,
            to: end,
            line: lineNumberAt(docText, start),
          };
        }
        idx = end;
        continue;
      }
    }
    idx += 1;
  }

  return null;
}

/**
 * Uses the live Lezer AST first (with delimiter fallback for unclosed `$$...$$`
 * or mid-typing states) to return the active math block containing `cursorPos`.
 */
export function detectActiveMathBlock(state: EditorState): ActiveMathBlock | null {
  const docText = state.doc.toString();
  const cursorPos = state.selection.main.head;
  const tree = syntaxTree(state);

  // Check $$...$$ first since Lezer tokenizes $$ carefully in some grammar versions
  const fallbackBefore = findMathDelimiterFallback(docText, cursorPos);
  if (fallbackBefore?.delimiter === "$$") {
    return fallbackBefore;
  }

  const astMatch = findEnclosingAstMathNode(tree, cursorPos);
  if (astMatch !== null) {
    const raw = docText.slice(astMatch.node.from, astMatch.node.to);
    if (astMatch.kind === "env") {
      const beginMatch = /^\\begin\{([a-zA-Z0-9*+@]+)\}/u.exec(raw);
      const envName = beginMatch?.[1] ?? "equation";
      if (DISPLAY_MATH_ENVS.has(envName)) {
        const endTag = `\\end{${envName}}`;
        const endIdx = raw.lastIndexOf(endTag);
        const innerStart = beginMatch?.[0].length ?? 0;
        const inner = raw.slice(innerStart, endIdx === -1 ? raw.length : endIdx);
        return {
          latex: prepareLatexForKatex(inner, envName),
          displayMode: true,
          delimiter: envName,
          from: astMatch.node.from,
          to: astMatch.node.to,
          line: lineNumberAt(docText, astMatch.node.from),
        };
      }
    } else if (astMatch.kind === "bracket") {
      const inner = raw.replace(/^\\\[/u, "").replace(/\\\]$/u, "");
      return {
        latex: prepareLatexForKatex(inner, "\\["),
        displayMode: true,
        delimiter: "\\[...\\]",
        from: astMatch.node.from,
        to: astMatch.node.to,
        line: lineNumberAt(docText, astMatch.node.from),
      };
    } else if (astMatch.kind === "paren") {
      const inner = raw.replace(/^\\\(/u, "").replace(/\\\)$/u, "");
      return {
        latex: prepareLatexForKatex(inner, "\\("),
        displayMode: false,
        delimiter: "\\(...\\)",
        from: astMatch.node.from,
        to: astMatch.node.to,
        line: lineNumberAt(docText, astMatch.node.from),
      };
    } else if (astMatch.kind === "dollar") {
      const inner = raw.replace(/^\$+/u, "").replace(/\$+$/u, "");
      const display = raw.startsWith("$$");
      return {
        latex: prepareLatexForKatex(inner, display ? "$$" : "$"),
        displayMode: display,
        delimiter: display ? "$$" : "$",
        from: astMatch.node.from,
        to: astMatch.node.to,
        line: lineNumberAt(docText, astMatch.node.from),
      };
    }
  }

  return fallbackBefore;
}
