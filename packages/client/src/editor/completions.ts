import {
  snippetCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import type { ProjectSymbolIndex } from "@texpulse/shared";
import { latexCompletionSource } from "codemirror-lang-latex";

const STRUCTURAL_SNIPPETS: readonly Completion[] = [
  snippetCompletion("\\begin{align}\n  ${1:a} &= ${2:b}\n\\end{align}", {
    label: "\\begin{align}",
    detail: "Align equations (snippet)",
    info: "Multi-line aligned equations environment (amsmath)",
    type: "keyword",
    boost: 95,
  }),
  snippetCompletion("\\begin{equation}\n  \\label{eq:${1:label}}\n  ${2:E = mc^2}\n\\end{equation}", {
    label: "\\begin{equation}",
    detail: "Numbered equation (snippet)",
    info: "Creates a numbered display equation with label",
    type: "keyword",
    boost: 94,
  }),
  snippetCompletion(
    "\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.85\\linewidth]{${1:figure.pdf}}\n  \\caption{${2:Caption text}}\n  \\label{fig:${3:label}}\n\\end{figure}",
    {
      label: "\\begin{figure}",
      detail: "Floating figure (snippet)",
      info: "Centered figure float with caption and label",
      type: "keyword",
      boost: 90,
    },
  ),
  snippetCompletion(
    "\\begin{table}[htbp]\n  \\centering\n  \\caption{${1:Caption text}}\n  \\label{tab:${2:label}}\n  \\begin{tabular}{${3:ll}}\n    \\toprule\n    ${4:Header 1} & ${5:Header 2} \\\\\n    \\midrule\n    ${6:Value 1} & ${7:Value 2} \\\\\n    \\bottomrule\n  \\end{tabular}\n\\end{table}",
    {
      label: "\\begin{table}",
      detail: "Booktabs table (snippet)",
      info: "Floating table with booktabs rules",
      type: "keyword",
      boost: 89,
    },
  ),
  snippetCompletion("\\begin{itemize}\n  \\item ${1:First item}\n\\end{itemize}", {
    label: "\\begin{itemize}",
    detail: "Bulleted list (snippet)",
    info: "Unordered list environment",
    type: "keyword",
    boost: 88,
  }),
  snippetCompletion("\\begin{enumerate}\n  \\item ${1:First item}\n\\end{enumerate}", {
    label: "\\begin{enumerate}",
    detail: "Numbered list (snippet)",
    info: "Ordered list environment",
    type: "keyword",
    boost: 87,
  }),
];

const CURATED_MATH_COMMANDS: readonly Completion[] = [
  snippetCompletion("\\frac{${1:num}}{${2:den}}", {
    label: "\\frac",
    detail: "Fraction",
    info: "Typesets numerator over denominator in math mode",
    type: "function",
    boost: 92,
  }),
  snippetCompletion("\\sqrt{${1:expr}}", {
    label: "\\sqrt",
    detail: "Square root",
    info: "Typesets radical symbol",
    type: "function",
    boost: 86,
  }),
  snippetCompletion("\\sum_{${1:i=1}}^{${2:n}}", {
    label: "\\sum",
    detail: "Summation operator",
    info: "Big summation with lower and upper limits",
    type: "function",
    boost: 85,
  }),
  snippetCompletion("\\int_{${1:a}}^{${2:b}}", {
    label: "\\int",
    detail: "Integral operator",
    info: "Definite integral with lower and upper bounds",
    type: "function",
    boost: 84,
  }),
  snippetCompletion("\\label{${1:key}}", {
    label: "\\label",
    detail: "Define cross-reference anchor",
    info: "Defines a target key resolvable by \\ref{} and \\eqref{}",
    type: "function",
    boost: 83,
  }),
  snippetCompletion("\\ref{${1:key}}", {
    label: "\\ref",
    detail: "Cross-reference label",
    info: "References a labeled section, figure, table, or equation",
    type: "function",
    boost: 82,
  }),
  snippetCompletion("\\eqref{${1:key}}", {
    label: "\\eqref",
    detail: "Parenthesized equation reference",
    info: "Formats equation reference in parentheses (amsmath)",
    type: "function",
    boost: 81,
  }),
  snippetCompletion("\\cite{${1:key}}", {
    label: "\\cite",
    detail: "Bibliography citation",
    info: "Cites a BibTeX entry from references.bib",
    type: "function",
    boost: 80,
  }),
];

const CITE_BEFORE_RE = /\\(?:cite|parencite|citep|citet|autocite)\*?(?:\[[^\]]*\])?\{([^{}]*)$/u;
const REF_BEFORE_RE = /\\(?:ref|eqref|autoref|cref|Cref|pageref|vref)\*?\{([^{}]*)$/u;

/**
 * Dual-layer completion pipeline:
 * 1) Project-wide `\cite{...}` and `\ref{...}` workspace symbols (Layer 2).
 * 2) Overleaf/Lezer `latexCompletionSource` commands + structural snippets with tab-stops (Layer 1).
 */
export function createTexpulseCompletionSource(
  getSymbolIndex: () => ProjectSymbolIndex,
) {
  const baseLatexSource = latexCompletionSource(true);

  return (context: CompletionContext): CompletionResult | null => {
    // Handle multi-key citations like `\cite{knuth1984texbook, pres`
    const citeMatch = context.matchBefore(CITE_BEFORE_RE);
    if (citeMatch !== null) {
      const inner = citeMatch.text.slice(citeMatch.text.lastIndexOf("{") + 1);
      const lastComma = inner.lastIndexOf(",");
      const prefix = lastComma === -1 ? inner : inner.slice(lastComma + 1);
      const leadingWhitespace = /^\s*/u.exec(prefix)?.[0].length ?? 0;
      const from =
        citeMatch.from +
        citeMatch.text.lastIndexOf("{") +
        1 +
        (lastComma === -1 ? 0 : lastComma + 1) +
        leadingWhitespace;

      const { citations } = getSymbolIndex();
      return {
        from,
        options: citations.map((entry) => ({
          label: entry.key,
          type: "variable",
          detail: `${entry.author} (${entry.year})`,
          info: `[${entry.entryType}] ${entry.title} — ${entry.filePath}:${String(entry.line)}`,
          boost: 99,
        })),
        validFor: /^[^,}\s]*$/u,
      };
    }

    const refMatch = context.matchBefore(REF_BEFORE_RE);
    if (refMatch !== null) {
      const from = refMatch.from + refMatch.text.lastIndexOf("{") + 1;
      const { labels } = getSymbolIndex();
      return {
        from,
        options: labels.map((sym) => ({
          label: sym.key,
          type: "constant",
          detail: `${sym.filePath}:${String(sym.line)}`,
          info: `Section context: ${sym.contextTitle}`,
          boost: 99,
        })),
        validFor: /^[^,}\s]*$/u,
      };
    }

    // Standard `\` command & `\begin{...}` environment completions
    const baseResult = baseLatexSource(context);
    const slashMatch = context.matchBefore(/\\[a-zA-Z]*$/u);

    if (slashMatch !== null) {
      const mergedOptions: Completion[] = [
        ...STRUCTURAL_SNIPPETS,
        ...CURATED_MATH_COMMANDS,
        ...(baseResult?.options ?? []),
      ];
      // Deduplicate by label+detail
      const seen = new Set<string>();
      const uniqueOptions = mergedOptions.filter((item) => {
        const k = `${item.label}::${item.detail ?? ""}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      return {
        from: slashMatch.from,
        options: uniqueOptions,
        validFor: /^\\?[a-zA-Z]*$/u,
      };
    }

    return baseResult;
  };
}
