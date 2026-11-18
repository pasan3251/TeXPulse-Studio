import katex from "katex";
import { useMemo } from "react";
import { prepareLatexForKatex } from "../editor/math-detector.js";

interface VisualReadingPaneProps {
  docText: string;
  filePath: string;
  onJumpToCodeLine: (line: number) => void;
}

type VisualBlock =
  | { kind: "heading"; level: 1 | 2; text: string; line: number }
  | { kind: "math"; latex: string; line: number }
  | { kind: "paragraph"; text: string; line: number };

function renderInlineKatexHtml(text: string): string {
  const escaped = text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/\\textbf\{([^{}]*)\}/gu, "<strong>$1</strong>")
    .replace(/\\textit\{([^{}]*)\}/gu, "<em>$1</em>")
    .replace(/\\(?:cite|ref|eqref)\{([^}]*)\}/gu, "<code>[$1]</code>")
    .replace(/~/gu, " ");

  return escaped.replace(/\$([^$\n]+)\$/gu, (_m, expr: string) => {
    try {
      return katex.renderToString(expr, { displayMode: false, throwOnError: false });
    } catch {
      return expr;
    }
  });
}

function parseVisualBlocks(docText: string): VisualBlock[] {
  const bodyMatch = /\\begin\{document\}([\s\S]*?)\\end\{document\}/u.exec(docText);
  const body = bodyMatch?.[1] ?? docText;
  const startOffset = bodyMatch?.index ?? 0;
  const lineBase = docText.slice(0, startOffset).split("\n").length - 1;

  const blocks: VisualBlock[] = [];
  const mathBlockRe =
    /\\begin\{(equation\*?|align\*?|gather\*?)\}([\s\S]*?)\\end\{\1\}|\$\$([\s\S]*?)\$\$/gu;

  let cursor = 0;
  const processTextSegment = (segment: string, offsetInBody: number): void => {
    const lines = segment.split(/\r?\n/u);
    let buffer: string[] = [];
    let bufferLine = lineBase + body.slice(0, offsetInBody).split("\n").length;

    const flushParagraph = () => {
      const joined = buffer.join(" ").trim();
      buffer = [];
      if (joined === "") return;
      blocks.push({ kind: "paragraph", text: joined, line: bufferLine });
    };

    for (let i = 0; i < lines.length; i += 1) {
      const rawLine = (lines[i] ?? "").trim();
      const currentLine = bufferLine + i;
      if (
        rawLine === "" ||
        rawLine.startsWith("%") ||
        rawLine === "\\maketitle" ||
        rawLine.startsWith("\\bibliography") ||
        rawLine.startsWith("\\label{")
      ) {
        flushParagraph();
        bufferLine = currentLine + 1;
        continue;
      }

      const secMatch = /^\\(section|subsection|subsubsection)\*?\{([^{}]*)\}/u.exec(rawLine);
      if (secMatch) {
        flushParagraph();
        blocks.push({
          kind: "heading",
          level: secMatch[1] === "section" ? 1 : 2,
          text: secMatch[2] ?? "",
          line: currentLine,
        });
        bufferLine = currentLine + 1;
        continue;
      }

      if (buffer.length === 0) {
        bufferLine = currentLine;
      }
      buffer.push(rawLine);
    }
    flushParagraph();
  };

  for (const match of body.matchAll(mathBlockRe)) {
    const idx = match.index ?? 0;
    if (idx > cursor) {
      processTextSegment(body.slice(cursor, idx), cursor);
    }
    const envName = match[1] ?? "$$";
    const inner = match[2] ?? match[3] ?? "";
    const prepared = prepareLatexForKatex(inner, envName);
    if (prepared !== "") {
      blocks.push({
        kind: "math",
        latex: prepared,
        line: lineBase + body.slice(0, idx).split("\n").length,
      });
    }
    cursor = idx + match[0].length;
  }

  if (cursor < body.length) {
    processTextSegment(body.slice(cursor), cursor);
  }

  return blocks;
}

/**
 * KaTeX-backed Visual reading view controlled by the Code ⇄ Visual header
 * segmented switch. Clicking any block jumps to its source line in Code mode.
 */
export function VisualReadingPane({
  docText,
  filePath,
  onJumpToCodeLine,
}: VisualReadingPaneProps) {
  const blocks = useMemo(() => parseVisualBlocks(docText), [docText]);

  return (
    <div className="tp-visual-view" data-testid="visual-reading-pane">
      <article className="tp-visual-article">
        <div className="tp-pdf-meta-label" style={{ marginBottom: "12px" }}>
          Visual KaTeX View · {filePath} (click any block to jump to source)
        </div>
        {blocks.map((block, idx) => {
          if (block.kind === "heading") {
            return block.level === 1 ? (
              <h1
                key={`${String(block.line)}-${String(idx)}`}
                className="tp-visual-h1"
                onClick={() => onJumpToCodeLine(block.line)}
              >
                {block.text}
              </h1>
            ) : (
              <h2
                key={`${String(block.line)}-${String(idx)}`}
                className="tp-visual-h2"
                onClick={() => onJumpToCodeLine(block.line)}
              >
                {block.text}
              </h2>
            );
          }

          if (block.kind === "math") {
            const html = katex.renderToString(block.latex, {
              displayMode: true,
              throwOnError: false,
            });
            return (
              <div
                key={`${String(block.line)}-${String(idx)}`}
                className="tp-visual-math"
                onClick={() => onJumpToCodeLine(block.line)}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            );
          }

          return (
            <p
              key={`${String(block.line)}-${String(idx)}`}
              className="tp-visual-p"
              onClick={() => onJumpToCodeLine(block.line)}
              dangerouslySetInnerHTML={{ __html: renderInlineKatexHtml(block.text) }}
            />
          );
        })}
      </article>
    </div>
  );
}
