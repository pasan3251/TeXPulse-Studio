# TeXPulse Studio 2.0 — Core Architectural Invariants

## 1. Monorepo Workspace Layout

* `packages/shared`: Shared TypeScript types, API/WebSocket protocol schemas, and global compile constants (`LATEXMK_BASE_FLAGS`).
* `packages/log-parser`: Ported Overleaf `latex-log-parser.ts`, `bib-log-parser.ts`, and `HumanReadableLogs` rules/hints/package-suggestions. Pure functions with unit tests.
* `packages/client`: React + TypeScript (strict) + Vite + CodeMirror 6 + KaTeX + PDF.js frontend.
* `packages/server` (or `src-tauri`): Local backend responsible for file I/O, `mylatexformat` `.fmt` caching, `latexmk`/`tectonic` execution, `synctex`, and `texcount`.

## 2. Non-Negotiable Engineering Constraints

* NEVER parse compiler diagnostics from `stdout`. Always parse the final settled `.log` and `.blg` files from disk via `packages/log-parser` to avoid stale multi-pass warnings.
* ALWAYS invoke local compilers with `-interaction=nonstopmode -file-line-error -synctex=1 -no-shell-escape`.
* ALWAYS kill the entire compiler process group when stopping or restarting a build so child `pdflatex` or `bibtex` processes never orphan.
* ALWAYS invert the PDF.js Y-coordinate (bottom-left origin) to a top-left origin before passing click coordinates to `synctex edit`.
* Version 2.0 AI assistance is 100% opt-in and local-first (Ollama / LM Studio OpenAI-compatible local endpoints by default, optional cloud Gemini API via `GEMINI_API_KEY`, or deterministic offline fallback). Consume editor context exclusively through `IDocumentContextProvider` and invoke inference solely through `IAssistantService` using contract-anchored snippets rather than raw full-project dumps.
