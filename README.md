# TeXPulse Studio 2.0

Local-first, offline-capable real-time LaTeX workspace with sub-second `mylatexformat` preamble caching, Overleaf-grade `.log`/`.blg` diagnostics, bidirectional SyncTeX PDF preview, CodeMirror 6 Lezer AST intelligence, and 100% opt-in local AI assistance.

## Workspace Architecture

- `packages/shared`: Shared TypeScript contracts, `LATEXMK_BASE_FLAGS` (`-interaction=nonstopmode -file-line-error -synctex=1 -no-shell-escape`), `EditorSettingsConfig`, and the `IDocumentContextProvider` / `IAssistantService` seams.
- `packages/log-parser`: Ported Overleaf `LatexLogParser`, `BibLogParser`, and `HumanReadableLogs` rules/hints/package-suggestion engine over settled `.log` and `.blg` files from disk.
- `packages/client`: React 19 + TypeScript (strict) + Vite + CodeMirror 6 (`codemirror-lang-latex`, Lezer AST outline, cross-file Go-To-Definition, live KaTeX math popover) + `PDF.js` viewer with bottom-left-to-top-left Y-inversion for `synctex edit` + Visual Reading pane.
- `packages/server`: Single-port Node.js HTTP server (`127.0.0.1:4317`) serving the built client SPA and `/api/*` routes (`mylatexformat` Tier 2 + `latexmk` Tier 3, `synctex`, `texcount`, atomic project persistence + `.zip` import/export, `AssistantService`, and standalone Edge/Chromium `--app=` desktop shell launcher).

## Prerequisites

- **Node.js** `>= 24 < 25` with Corepack (`pnpm@10.12.1`)
- **TeX distribution** on `PATH`: `pdflatex` (plus `xelatex` / `lualatex` optional), `latexmk`, `bibtex`, `synctex`, and `texcount` (TeX Live or MiKTeX)

## Quick Start

```bash
# Install dependencies and build all workspace packages
pnpm install
pnpm build

# Run full unit test suite & strict TypeScript verification
pnpm test
pnpm typecheck

# Start the unified single-port production server (SPA + API on http://127.0.0.1:4317)
pnpm start
```

### Standalone Desktop Shell (`Edge / Chromium --app` Mode)

```bash
# Launch the single-port server inside a dedicated frameless desktop window
pnpm desktop:start

# Verify SPA + /api/health on an ephemeral port without opening a GUI window
node packages/server/dist/desktop-launcher.js --smoke-test

# Generate portable desktop launcher scripts and manifest in dist/desktop/
pnpm desktop:package
```

## Development Mode

```bash
# Terminal 1: API backend on http://127.0.0.1:4317
pnpm dev:server

# Terminal 2: Vite HMR frontend on http://127.0.0.1:5173
pnpm dev
```

## Keyboard Shortcuts

- `Ctrl/Cmd + S` or `Ctrl/Cmd + Enter`: Compile project (`mylatexformat` Tier 2 / `latexmk` Tier 3)
- `F12` or `Ctrl/Cmd + Click`: Cross-file Go-To-Definition for `\input`, `\include`, `\ref`/`\eqref`/`\cref`, and single/multi-key `\cite{...}`
- `Ctrl/Cmd + K`: Open the inline AI LaTeX command bar (requires local Ollama `:11434`, LM Studio `:1234`, custom OpenAI-compatible URL, or opt-in Gemini API via `Settings` or `GEMINI_API_KEY`; deterministic AST fallback stays offline)
- `Ctrl/Cmd + B` / `Ctrl/Cmd + I`: Wrap selection in `\textbf{}` / `\textit{}`
- `Ctrl/Cmd + /`: Toggle `%` comment

## Core Engineering Invariants

1. **Settled Log Parsing Only**: Diagnostics are parsed exclusively from settled `.log` and `.blg` files via `@texpulse/log-parser`, never compiler `stdout`.
2. **Restricted Safe Compiler Invocation**: Local engines always run with `-interaction=nonstopmode -file-line-error -synctex=1 -no-shell-escape`.
3. **Process-Group Cleanup**: Canceling or restarting builds terminates the entire process tree cleanly.
4. **SyncTeX Y-Axis Inversion**: PDF.js bottom-left user coordinates are inverted against MediaBox height to top-left coordinates before calling `synctex edit`.
5. **Opt-In Local-First AI**: All editor context flows through `IDocumentContextProvider` (`@texpulse/shared`) as compact, cursor-anchored snippets rather than full-project dumps.
