# Project Roadmap

This roadmap records the development path from the original SRS plan through the
current `0.1.0-rc.1` release candidate plus Sprint 15 usability work. It is
historical and explanatory. `docs/SRS.md` remains the authoritative product
specification, and `docs/SPRINT_STATUS.md` remains the compact status ledger.

## 1. Product Intent

TeXPulse Studio was planned as an offline Windows LaTeX editor that feels close
to an online editing workflow while keeping source files, compilation, logs, and
recovery data local by default.

The SRS defined ten core user outcomes:

1. Open or create a local LaTeX project.
2. Edit multiple source files.
3. Save changes safely.
4. Compile manually or automatically.
5. Show the newest valid PDF beside the source.
6. Present errors, warnings, affected lines, and raw logs.
7. Navigate source to PDF and PDF to source with SyncTeX.
8. Continue offline.
9. Preserve user ownership of local files.
10. Recover safely from compiler failures, app crashes, and invalid documents.

## 2. Planning From The SRS

The SRS split the project into small implementation phases so the product would
not be built as one risky change.

| SRS phase | Planned result           | Implemented through                         |
| --------- | ------------------------ | ------------------------------------------- |
| Phase 0   | Repository foundation    | Sprint 0                                    |
| Phase 1   | Compiler core            | Sprints 1-3                                 |
| Phase 2   | Offline MVP              | Sprints 4-6                                 |
| Phase 3   | Developer-grade feedback | Sprints 7-9                                 |
| Phase 4   | Hardening and release    | Sprints 10-12                               |
| Phase 5   | Optional enhancements    | Sprints 13-15, with Sprint 14 research-only |

### 2.1 Architecture Principles

The SRS established these boundaries before feature work:

- The Electron renderer is treated as untrusted.
- `nodeIntegration` is disabled.
- `contextIsolation` is enabled.
- The renderer talks through a narrow typed preload bridge.
- IPC requests and responses are schema validated.
- Paths are project-relative in the renderer and canonicalized in the main
  process.
- Compiler execution uses executable plus argument arrays, not shell strings.
- TeX shell escape is disabled by default.
- Every build has a generation number so stale output cannot replace newer
  output.
- Source content stays local by default.

### 2.2 Compiler Adapter Planning

The SRS planned a compiler abstraction so MiKTeX would be the first backend, not
a permanent hard-coded assumption:

```ts
interface CompilerAdapter {
  probe(): Promise<ToolchainStatus>;
  compile(request: CompileRequest): Promise<CompileResult>;
  cancel(buildId: string): Promise<void>;
}
```

This shaped the later `src/compiler/`, `src/build/`, and CLI modules. Future TeX
Live or Tectonic work should extend this boundary instead of bypassing it.

### 2.3 Build State Planning

The planned build flow was:

```text
idle
-> debouncing
-> saving
-> queued
-> compiling
-> succeeded | failed | cancelled
-> idle
```

The implementation keeps the same intent: save before compile, one active
compiler process, newest queued request wins, stale results rejected, and last
successful PDF retained.

### 2.4 Compile Command Policy

The first real recipe was planned around `latexmk`:

```text
latexmk
-pdf
-synctex=1
-interaction=nonstopmode
-file-line-error
-halt-on-error
-outdir=<validated-build-directory>
<validated-root-file>
```

Production compilation remains shell-free and project-scoped.

### 2.5 Settings Planning

The SRS planned local settings with explicit schema versions:

```json
{
  "schemaVersion": 1,
  "autosave": true,
  "autoBuild": true,
  "debounceMs": 800,
  "compileTimeoutMs": 120000,
  "toolchain": {
    "customBinDirectory": null
  }
}
```

Project settings are stored separately in `.texpulse/project.json`.

### 2.6 Quality Gate Planning

The SRS required every sprint to end with applicable checks, documentation,
traceability, and an honest sprint report. The current aggregate gate is:

```powershell
pnpm check
pnpm audit:dependencies
```

`pnpm check` runs formatting, linting, strict type checking, unit, component,
integration, performance, coverage, Electron E2E, and production build steps.

## 3. Installation And Tooling

### 3.1 Runtime Requirements

- Windows 11 x64
- MiKTeX with `latexmk`
- Native Windows Perl on `PATH`

MiKTeX and Perl are not bundled. The app verifies readiness through a real
isolated self-test before claiming the toolchain is ready.

### 3.2 Development Requirements

- Node.js 24.x
- pnpm 10.12.1 through Corepack
- Git

Setup:

```powershell
corepack prepare pnpm@10.12.1 --activate
corepack enable pnpm --install-directory "$(npm config get prefix)"
pnpm install --frozen-lockfile
```

Run the app:

```powershell
pnpm app:start
```

Build packages:

```powershell
pnpm package:dir
pnpm package:win
pnpm test:packaged
pnpm release:manifest
```

### 3.3 Libraries Used

Production dependencies:

| Library               | Purpose                                          |
| --------------------- | ------------------------------------------------ |
| React and React DOM   | Renderer UI                                      |
| CodeMirror packages   | LaTeX-aware editor, state, and view behavior     |
| PDF.js (`pdfjs-dist`) | In-app PDF rendering                             |
| Chokidar              | Project watching                                 |
| Zod                   | Runtime schemas for IPC, settings, and contracts |

Development dependencies:

| Library/tool          | Purpose                                                       |
| --------------------- | ------------------------------------------------------------- |
| TypeScript            | Strict application typing                                     |
| Vite                  | Renderer and preload builds                                   |
| Electron              | Desktop runtime                                               |
| Electron Builder      | Windows NSIS packaging                                        |
| Vitest                | Unit, integration, component, performance, and coverage tests |
| React Testing Library | Renderer component tests                                      |
| Playwright            | Electron E2E and packaged lifecycle tests                     |
| ESLint and Prettier   | Linting and formatting                                        |
| YAML                  | Release manifest support                                      |

### 3.4 Repository Resources Used

- `docs/SRS.md` for product planning and requirements.
- `docs/ARCHITECTURE.md` for implemented process, compiler, project, PDF, and
  packaging boundaries.
- `docs/SECURITY.md` and `docs/THREAT_MODEL.md` for security controls.
- `docs/TEST_PLAN.md` for regression scope.
- `docs/REQUIREMENTS_TRACEABILITY.md` for requirement-to-evidence mapping.
- `docs/reports/SPRINT-0.md` through `docs/reports/SPRINT-15.md` for sprint
  evidence.
- `docs/adr/ADR-0000-template.md` through `docs/adr/ADR-0015-*.md` for
  architectural decisions.
- `fixtures/` for real and deterministic LaTeX projects.
- `tests/integration/fixtures/` for fake `latexmk` and SyncTeX tools.
- `output/playwright/` and `output/pdf/` for visual and PDF evidence.

## 4. Sprint Roadmap

### Sprint 0: Repository, Requirements, And Engineering Controls

**SRS plan:** Establish a reproducible repository without product features.

**Implemented:** Git, pnpm, strict TypeScript, ESLint, Prettier, Vitest, build
checks, Windows CI, `AGENTS.md`, documentation skeletons, ADR template, ADR-0001
for the stack, ADR-0002 for native Windows development, and a deterministic
health-check test.

**Code and docs:** `package.json`, `tsconfig*.json`, `.github/workflows/ci.yml`,
`docs/SRS.md`, `docs/ARCHITECTURE.md`, `docs/TEST_PLAN.md`,
`docs/SPRINT_STATUS.md`, `docs/REQUIREMENTS_TRACEABILITY.md`, and ADRs.

**Tests:** configuration smoke test, strict-mode checks, formatting, linting,
typecheck, unit test, and build.

### Sprint 1: Toolchain Probe And Minimal Compile CLI

**SRS plan:** Prove MiKTeX tools can be found and a minimal document can compile
outside Electron.

**Implemented:** executable discovery, version parsing, `texpulse-doctor`,
`texpulse-compile`, structured JSON results, missing-tool messages, fake-tool
tests, path-with-spaces coverage, and real MiKTeX PDF evidence when available.

**Code:** `src/toolchain/`, `src/compiler/`, `src/cli/`, and
`fixtures/minimal-success/`.

**Tests:** mocked `PATH`, fake executables, integration compile, optional real
MiKTeX smoke, and PDF inspection.

### Sprint 2: Build Orchestration, Cancellation, Timeout, And Generations

**SRS plan:** Create a compiler service independent of the UI.

**Implemented:** build controller, generation IDs, one active build per project,
newest-request queue replacement, cancellation, timeout, process-tree cleanup,
stdout/stderr capture, result metadata, and retained last-successful metadata.

**Code:** `src/build/`, `src/compiler/`, and process runner modules.

**Tests:** state transitions, rapid requests, cancellation, timeout, stale
result rejection, fake compiler integration, and process cleanup.

### Sprint 3: Project Model And Safe Filesystem Service

**SRS plan:** Manage local projects safely before UI work.

**Implemented:** canonical project roots, boundary checks, ignored file
enumeration, root detection, UTF-8 text read/write, version tokens, atomic
saves, external-change conflicts, project metadata validation, and recent
project persistence.

**Code:** `src/project/`.

**Tests:** root detection, path validation, CRUD operations, Unicode paths,
spaces in paths, external conflicts, symlink/junction behavior, and read-only
failure paths.

### Sprint 4: Secure Electron Shell And Editor

**SRS plan:** Create the first usable desktop shell without compilation UI.

**Implemented:** Electron, React, Vite renderer, sandboxed BrowserWindow, typed
preload API, validated IPC, project explorer, CodeMirror editor, modified-state
markers, Save and Save All, cursor/scroll restoration, and external-change
notices.

**Code:** `src/electron/`, `src/ipc/`, and `src/renderer/`.

**Tests:** renderer reducer tests, component tests, IPC integration tests,
BrowserWindow security assertions, and Electron E2E open/edit/save workflow.

### Sprint 5: Manual Compilation And PDF Preview

**SRS plan:** Deliver the first source-to-PDF vertical slice.

**Implemented:** Compile button, save-before-compile, cancellation control,
typed build/PDF IPC, project/build session, PDF.js preview, page/zoom/fit
controls, raw build logs, retained last-successful PDF, current-versus-retained
status, and main-process revalidated open/reveal actions.

**Code:** `src/electron/project-session.ts`, build IPC contracts, PDF viewer,
and renderer orchestration.

**Tests:** compile IPC integration, E2E compile workflow, PDF reload state,
failed-build retained PDF, missing-PDF handling, screenshots, and real PDF
inspection.

### Sprint 6: Autosave And Debounced Live Compilation

**SRS plan:** Provide the Overleaf-like rapid feedback loop.

**Implemented:** configurable autosave, default 800 ms debounce, automatic
build, serialized saves, newest-only live compilation, stale editor-revision
rejection, bounded watcher, workspace restoration, pane resizing, and responsive
editing during compile.

**Code:** live build coordinator, workspace persistence, project watcher, and
renderer build flow.

**Tests:** fake-timer debounce, rapid typing, newest build E2E, save failure
prevents compile, rebuild-loop regression, and UI responsiveness.

### Sprint 7: Structured Diagnostics

**SRS plan:** Turn raw logs into source-linked problems.

**Implemented:** bounded diagnostic model, parser for common LaTeX, `latexmk`,
BibTeX, and Biber output, Problems panel, CodeMirror line markers, source
navigation, stale diagnostic rejection, raw-log fallback, and malformed-log
resilience.

**Code:** `src/diagnostics/`, diagnostic IPC contracts, renderer Problems panel,
and editor marker integration.

**Tests:** golden parser fixtures, malformed logs, multi-file diagnostics,
component and integration coverage, E2E introduce-error/fix-error, and native
MiKTeX log validation.

### Sprint 8: SyncTeX Forward And Inverse Navigation

**SRS plan:** Connect source locations and PDF positions.

**Implemented:** SyncTeX parser and service, timed shell-free main-process
commands, strict forward/inverse IPC, current-artifact validation, project-path
validation, PDF target marker, editor target marker, missing-data messages,
multi-file support, and spaces-in-path coverage.

**Code:** `src/synctex/`, SyncTeX IPC contracts, PDF viewer target marker, and
editor navigation targets.

**Tests:** parser unit tests, fake SyncTeX integration, E2E forward and inverse
navigation, multi-file fixtures, and real MiKTeX/SyncTeX round trip.

### Sprint 9: Recipes, Settings, Setup Wizard, And Clean Builds

**SRS plan:** Make the tool configurable for realistic projects.

**Implemented:** schema-versioned global and project settings, migrations, safe
fallback notices, setup wizard, custom executable directory, pdfLaTeX, XeLaTeX,
and LuaLaTeX recipes, compile timeout, editor font size, PDF zoom default,
explicit `.latexmkrc` trust, clean build, auxiliary cleanup, and bibliography
fixtures.

**Code:** settings modules, setup dialog, recipe generation, cleanup service,
and project metadata updates.

**Tests:** settings schema/migration tests, recipe arguments, setup wizard
component tests, bibliography integration, clean-build E2E, and native MiKTeX
recipe evidence.

### Sprint 10: Security And Recovery Hardening

**SRS plan:** Address abuse cases, crashes, and data-loss risks.

**Implemented:** implementation-matched threat model, bounded process output,
generated output quotas, generation retention, CSP, navigation policy,
dependency audit gate, abnormal-shutdown recovery, explicit recovery review,
structured local logs, redacted support export, recovery/log cleanup, and
trusted-project limitations.

**Code:** recovery store, support log modules, output limit modules, navigation
policy, CSP configuration, and security docs.

**Tests:** path traversal, shell metacharacters, output bounds, oversized logs,
crash recovery E2E, dependency audit, and native PDF inspection.

### Sprint 11: Packaging And First-Run Experience

**SRS plan:** Produce an installable Windows beta.

**Implemented:** Electron Builder/NSIS packaging, application metadata,
placeholder icon assets, development/packaged resource resolution, editable
bundled sample, fixed sample preload method, first-run setup, release
documentation, and installed lifecycle test.

**Code and resources:** `electron-builder` config, `resources/`, packaged
resource helpers, sample project, release docs, and package scripts.

**Tests:** packaged application install, launch, real self-test, edit sample,
compile sample, high-DPI PDF preview, reopen persistence, uninstall, and paths
with spaces.

### Sprint 12: Release-Candidate Hardening

**SRS plan:** Validate the complete offline product as a release candidate.

**Implemented:** full regression, project creation from template, validated
file/folder actions, confirmed deletion, recent project reopening, source-only
ZIP export, root remapping after moves, performance checks, requirement
traceability completeness, accessibility checks, previous-beta settings
verification, release manifest tooling, deferred issue review, and `v0.1.0-rc.1`
release tag.

**Code:** project mutation IPC, ZIP export, release manifest script, performance
fixtures, and documentation updates.

**Tests:** full unit/component/integration/performance/coverage/E2E suites,
packaged lifecycle, accessibility checks, native fixtures, and release candidate
provenance.

### Sprint 13: Read-Only Git Status Awareness

**SRS plan:** Optional later Git awareness without source safety compromise.

**Implemented:** read-only `git status` summary service, timed shell-free Git
process, bounded schemas, one no-argument preload method, renderer status-bar
summary, and refreshes after project changes.

**Deferred:** templates, local revision history, diff views, commit assistance,
and any write-capable Git operation.

**Tests:** parser unit tests, IPC integration tests, real temporary-repository
integration, E2E bridge, and packaged bridge checks.

### Sprint 14: Collaboration Research Controls

**SRS plan:** Research collaboration before runtime implementation.

**Implemented:** separate collaboration SRS, remote-peer threat model, and
ADR-0015 selecting a future feature-flagged local-network WebSocket plus Yjs
research direction with host authority over files and compilation.

**Not implemented:** runtime collaboration, listeners, remote editing,
collaboration dependencies, guest file authority, hosted services, or remote
compilation.

**Docs:** `docs/COLLABORATION_SRS.md`, `docs/COLLABORATION_THREAT_MODEL.md`, and
`docs/adr/ADR-0015-collaboration-research-prototype.md`.

### Sprint 15: Explorer And Preview Usability

**Plan source:** User-directed post-roadmap usability slice mapped back to
existing project, build, PDF, UX, privacy, and security requirements.

**Implemented:** material-inspired file/folder icons, collapsible folders,
compact New File/New Folder actions, scoped file/folder/background context
menus, recursive copy, desktop reveal, active standalone `.tex` root selection,
configured-root fallback for included fragments, continuous multi-page PDF
viewer, page shortcuts, scroll retention, SyncTeX retention, and CI-stable E2E
workflow contracts.

**Code:** renderer explorer/PDF updates, `ProjectService` copy/reveal
validation, IPC contracts, preload methods, and tests.

**Tests:** unit, component, integration, performance, coverage, E2E, packaged
bridge, native active-root MiKTeX compile, PDF inspection, and focused CI
stability repeats.

## 5. Current Version Summary

Current public version: `0.1.0-rc.1`

The current build is an installable Windows release candidate with:

- local project creation/opening;
- safe text editing and saving;
- autosave and live compilation;
- manual compile with `Ctrl+Enter`;
- local MiKTeX `latexmk` recipes;
- PDF.js preview with continuous scrolling;
- retained last successful PDF;
- structured diagnostics and raw logs;
- SyncTeX forward and inverse navigation;
- setup wizard and toolchain doctor;
- recovery and support logs;
- source-only ZIP export;
- read-only Git status;
- packaging and release manifest evidence.

## 6. Current Limitations

The main known limitations are tracked in `docs/DEFERRED_ISSUES.md` and
`docs/SPRINT_STATUS.md`:

- installer is unsigned;
- no automatic updates;
- Windows 11 x64 only;
- MiKTeX and Perl are external prerequisites;
- no TeX Live or Tectonic adapter yet;
- no collaboration runtime;
- no local revision history or diff view;
- no automatic external-file merge;
- no OS-level hostile-project sandbox;
- continuous PDF viewer renders all pages instead of virtualizing very large
  documents.

## 7. Roadmap After Current Version

Future work is tracked in `docs/UPCOMING_IMPLEMENTATIONS.md`. The highest-value
next slices are likely:

1. release signing and installer trust;
2. automatic updates after signing;
3. external-change compare and merge;
4. local revision history and diff view;
5. template library;
6. PDF virtualization for large documents;
7. TeX Live adapter;
8. collaboration runtime only after a fresh sprint plan and threat-model review.

## 8. Traceability

For detailed requirement evidence, use:

- `docs/REQUIREMENTS_TRACEABILITY.md`
- `docs/SPRINT_STATUS.md`
- `docs/reports/SPRINT-0.md` through `docs/reports/SPRINT-15.md`
- `docs/TEST_PLAN.md`
- `docs/SECURITY.md`
- `docs/THREAT_MODEL.md`
- `docs/adr/`
