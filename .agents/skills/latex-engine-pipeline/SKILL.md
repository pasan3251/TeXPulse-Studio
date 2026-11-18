---
name: latex-engine-pipeline
description: Implements and tests the Three-Tier LaTeX compilation pipeline (mylatexformat precompiled preambles, latexmk/tectonic execution, SyncTeX coordinate mapping) and Overleaf HumanReadableLogs parsing. Use when working on packages/server, src-tauri, or packages/log-parser. Do not use for static UI styling.
---

# LaTeX Compilation & Diagnostic Engineering Workflow

1. **Precompiled Preamble (`mylatexformat`) Execution:**
   * Track changes to the document text preceding `\begin{document}` (or `\endofdump`).
   * For `pdflatex` builds where the preamble is unchanged, compile with `--fmt=".texpulse-cache/preamble_cache"` to bypass package re-initialization.
   * When the preamble changes or `xelatex`/`lualatex` is selected, rebuild the `.fmt` cache or run `latexmk`.

2. **Overleaf Log Parser & `HumanReadableLogs` Mapping:**
   * Parse settled `.log` files via `LatexLogParser.parse(logText, { ignoreDuplicates: true })` and `.blg` files via `BibLogParser`.
   * Map each entry through `HumanReadableLogsRules`, `HumanReadableLogsHints`, and `HumanReadableLogsPackageSuggestions` to attach plain-text explanations and missing package suggestions.
