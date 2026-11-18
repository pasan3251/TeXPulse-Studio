# TeXPulse Studio v1 — Architectural Post-Mortem & Audit

**Audit Date:** November 2026  
**Target Architecture:** TeXPulse Studio 2.0 (Clean-Slate Monorepo Rebuild)

---

## 1. Executive Summary

`TeXPulse-Studio` v1 was built as a single-package offline Windows Electron + React + TypeScript prototype (`electron@42.4.0`, `react@19.2.7`, `codemirror@6.0.2`, `pdfjs-dist@6.0.227`, `zod@4.4.3`) coupling local MiKTeX `latexmk` builds with a split-pane PDF viewer.

While v1 contains well-tested, pure TypeScript utilities for path canonicalization, symlink boundary enforcement, atomic file writes, process-tree cleanup, and SyncTeX output parsing, its core editing, compilation, diagnostic, and UI layers violate the TeXPulse Studio 2.0 PRD:
1. **Un-cached full `latexmk` spawns** in isolated per-generation directories on every edit (no Tier 1 KaTeX live preview, no Tier 2 `mylatexformat` `.fmt` preamble cache).
2. **Raw `stdout`/`stderr` concatenation** into a custom regex log parser instead of deterministic file-only `.log`/`.blg` parsing with Overleaf's `latex-log-parser` and `HumanReadableLogs`.
3. **Legacy CodeMirror StreamLanguage (`stex`)** instead of Overleaf's Lezer-based incremental AST grammar (`texlyre/codemirror-lang-latex`) and `IDocumentContextProvider` V2 AI seam.
4. **Monolithic Electron IPC coupling** (34 IPC channels wired into a 2,043-line `App.tsx`).
5. **AI UI Slop** in `src/renderer/styles.css` (radial/linear gradients, glowing amber box-shadows, 64px topbar + stacked secondary toolbars, hardcoded dark-navy/amber palette, and missing `tabular-nums`).

---

## 2. Salvageable Logic (Port to v2 Monorepo)

The following pure functions and self-contained domain modules have strong unit test coverage and should be extracted into `packages/shared` or `packages/server` during the v2 rebuild:

| v1 Module | File Path | Salvageable Symbols & Logic | Target v2 Package & Notes |
| :--- | :--- | :--- | :--- |
| **SyncTeX Output Parser** | `src/synctex/synctex-parser.ts` | `parseForwardSyncOutput()`, `parseInverseSyncOutput()`, `MAX_SYNCTEX_OUTPUT_CHARACTERS` (512 KiB cap) | `packages/shared` or `packages/server` — Pure parser for `SyncTeX result begin` / `SyncTeX result end` blocks with portable path resolution against known project files. |
| **SyncTeX CLI Wrapper** | `src/synctex/synctex-service.ts` | `SynctexService.forward()` (`synctex view -i`), `SynctexService.inverse()` (`synctex edit -o`), 5,000 ms timeout, env sanitization (`SYNCTEX_EDITOR`/`SYNCTEX_VIEWER` stripped) | `packages/server` — Keep CLI argument array builder; pair with mandatory PDF.js Y-coordinate inversion in `packages/client`. |
| **Project Path Canonicalization & Symlink Guard** | `src/project/project-paths.ts` & `src/compiler/path-validation.ts` | `canonicalProjectRoot()`, `normalizeProjectPath()`, `resolveProjectPath()`, `isPathInside()`, `validateCompilePaths()` | `packages/server` — Rejects `..` path traversal, NUL bytes, and refuses to traverse project-internal symbolic links or Windows junctions via `lstat`. |
| **File-Tree Builder & Root Detection** | `src/renderer/project-tree.ts` & `src/project/root-detection.ts` | `buildProjectTree()`, `rankRootCandidates()` | `packages/shared` — Pure functions converting flat portable paths into a sorted directory-first tree and scoring `.tex` root candidates by `\documentclass`, `\begin{document}`, and `main.tex`/`root.tex`/`thesis.tex`. |
| **Atomic File Write & Version-Token Concurrency** | `src/project/atomic-write.ts` & `src/project/project-service.ts` | `atomicWriteFile()`, `versionFor()` (SHA-256 content hash), `ProjectService.writeTextFile()` | `packages/server` — Write-temp-fsync-rename atomic persistence and optimistic SHA-256 version-token checks to prevent silent external-edit overwrites. |
| **Streaming ZIP Export** | `src/project/zip-export.ts` | `exportProjectZip()`, streaming CRC32 calculation | `packages/server` — Zero-dependency ZIP archive writer for Overleaf `.zip` export (extend in v2 with `.zip` import). |
| **Crash Recovery & Recent Projects Stores** | `src/recovery/recovery-store.ts` & `src/project/recent-projects.ts` | `RecoveryStore` (64 MiB cap, Zod schema validation), `RecentProjectsStore` (20-project cap) | `packages/server` — Bounded snapshot persistence for dirty editor buffers and recent workspace list. |
| **Process-Group / Tree Runner** | `src/process/process-runner.ts` & `src/toolchain/executable-discovery.ts` | `NodeProcessRunner`, `terminateWindowsProcessTree()` (`taskkill /PID <pid> /T /F`), `terminatePosixProcessGroup()` (`process.kill(-pid, "SIGKILL")`), `discoverExecutable()` | `packages/server` — Spawns binaries with `shell: false`, enforces 8 MiB capture cap, `AbortSignal` cancellation, and full OS process-tree termination so child `pdflatex`/`bibtex` processes never orphan. |
| **Debounce & Build State Machine** | `src/renderer/live-build-coordinator.ts` & `src/build/build-controller.ts` | `LiveBuildCoordinator`, `BuildController` | `packages/client` & `packages/server` — Revision-tracked edit debounce and newest-generation disposition tracking (`current` vs. `stale` vs. `superseded`). |

---

## 3. Deprecated Debt (Archive to `legacy-v1/`)

The following v1 modules violate the TeXPulse Studio 2.0 PRD and must **not** be carried forward into active v2 packages:

| Deprecated v1 Area | File Path(s) | PRD Violation & Technical Debt | v2 Replacement |
| :--- | :--- | :--- | :--- |
| **Stdout/Stderr Log Mixing & Custom Regex Parser** | `src/electron/project-session.ts` (`readDisplayLog`, L633–L676), `src/diagnostics/diagnostic-parser.ts` (L1–L560) | Appends `--- stdout ---` and `--- stderr ---` onto `.log` output and parses the combined string with custom regexes. Captures transient multi-pass warnings, lacks `.blg` file parsing, and lacks plain-English hints or CTAN package suggestions. | `packages/log-parser` — Port Overleaf's `latex-log-parser.ts` (`ignoreDuplicates: true`), `bib-log-parser.ts`, and `HumanReadableLogs` rules/hints/package-suggestions; parse **only** settled `.log` and `.blg` files from disk. |
| **Un-Cached Per-Generation `latexmk` Spawns & `-halt-on-error`** | `src/compiler/miktex-compiler.ts` (L106–L315), `src/compiler/latexmk-arguments.ts` (L17–L32), `src/build/build-controller.ts` (L180–L192) | Creates a fresh `.texpulse/build/generations/<gen>-<uuid>` directory on every build, forcing cold package initialization on every edit. Passes `-halt-on-error` alongside `-interaction=nonstopmode`. Lacks KaTeX preview and `.fmt` caching. | **Three-Tier Pipeline:** Tier 1 in-memory KaTeX math preview; Tier 2 `mylatexformat` `.fmt` precompiled preamble cache in `.texpulse-cache/`; Tier 3 `latexmk` / optional Tectonic with `-interaction=nonstopmode -file-line-error -synctex=1 -no-shell-escape`. |
| **PDF.js SyncTeX Y-Axis Origin Bug** | `src/renderer/components/PdfViewer.tsx` (`handleInverseSearch`, L461–L468) | Computes `(event.clientY - bounds.top) / renderedScale` directly without explicit PDF.js bottom-left to SyncTeX top-left Y-coordinate inversion across PDF viewport transforms, and binds inverse search to double-click instead of `Cmd/Ctrl + Click`. | `packages/client` (`PdfView.tsx`) — Explicitly invert PDF.js bottom-left Y-coordinate to top-left origin before calling `synctex edit`, triggered via `Cmd/Ctrl + Click`, while preserving exact scroll/zoom across rebuilds. |
| **Legacy StreamLanguage `stex` Editor & No AST Seam** | `src/renderer/components/EditorPane.tsx` (L1–L135), `package.json` (`@codemirror/legacy-modes`) | Uses legacy stream tokenizer (`stex`) with hardcoded dark colors (`#111827`, `#f59e0b`). No Lezer syntax tree, no inline command/environment/ref/cite autocomplete, no AST linter, and no `IDocumentContextProvider` interface. | `packages/client` — CodeMirror 6 + `texlyre/codemirror-lang-latex` (`latex()`, `autoCloseTags`, `autoCloseBrackets`, `latexHoverTooltip`, `snippets`, `latexLinter`), workspace `\ref`/`\cite` completion, and `IDocumentContextProvider`. |
| **Monolithic Electron IPC & 2,043-Line `App.tsx`** | `src/electron/project-ipc.ts` (994 lines), `src/electron/preload.ts`, `src/renderer/App.tsx` (2,043 lines) | Tightly couples 34 Electron IPC channels and a single-project global session directly to an oversized React root component in a single-package repo. | 4-package monorepo (`packages/shared`, `packages/log-parser`, `packages/client`, `packages/server` or `src-tauri`) with clean service boundaries. |
| **AI UI Slop & Anti-HIG Styling** | `src/renderer/styles.css` (1,643 lines) | Uses decorative `radial-gradient` and `linear-gradient` backgrounds, glowing amber drop shadows (`box-shadow: 0 0 24px ...`), 64px topbar + stacked secondary toolbars (`.editor-tabbar`, `.pdf-header`, `.pdf-toolbar`), 10px–14px border radii, Georgia serif headers, no Light/Dark theme toggle, and no `tabular-nums`. | Enforce `.agents/rules/anti-slop-apple-ui.md` and `docs/UI-DESIGN-SYSTEM.md`: single 40px header, 1px solid hairline borders, Apple HIG Light/Dark surface tokens, `tabular-nums`, max 8px modal / 6px button radius, zero gradients/glows. |
