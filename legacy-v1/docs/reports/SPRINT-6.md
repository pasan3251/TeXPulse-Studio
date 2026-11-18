# Sprint 6 Report

## 1. Sprint completed

Sprint 6: Autosave and debounced live compilation completed on 2026-06-14.
Sprint 7 work was not started.

## 2. Requirement IDs implemented

- `FR-EDIT-007` and `FR-EDIT-010`
- `FR-SAVE-001` through `FR-SAVE-006`
- `FR-BUILD-002` through `FR-BUILD-007`, `FR-BUILD-016`, and `FR-BUILD-017`
- `FR-PDF-008`
- Partial `FR-SET-003` for autosave, auto-build, and debounce preferences
- `NFR-PERF-001` through `NFR-PERF-004` and `NFR-PERF-006`
- `NFR-REL-001` through `NFR-REL-005`
- `NFR-SEC-004` through `NFR-SEC-006`
- `NFR-PRIV-001` and `NFR-PRIV-002`
- `AS-001` and `AS-003`

## 3. Files changed

Sprint 6 changes 36 repository paths and adds or updates:

- a pure renderer live-build coordinator with autosave, configurable debounce,
  manual build, queue phases, cancellation, and serialized saves;
- renderer revision and buffer-content checks before accepting build or PDF
  results;
- a main-process Chokidar watcher with link avoidance, generated-directory
  ignores, internal-write suppression, and project-scoped notifications;
- a strict ninth preload method for validated filesystem change events;
- validated workspace persistence for open files, active file, cursor/scroll
  views, pane ratio, and live-build settings;
- page-hide persistence flushing so a fast renderer reload does not lose the
  newest workspace state;
- autosave, auto-build, delay, visible phase, and accessible pane-resize
  controls;
- fake-timer coordinator and watcher tests, controlled live-flow integration,
  and expanded Electron E2E coverage;
- pinned `chokidar` 5.0.0 and ADR-0008; and
- updated architecture, security, testing, troubleshooting, status,
  traceability, contributor, agent, and user documentation.

## 4. Design decisions

- Keep debounce and unsaved-buffer coordination in a pure renderer state machine
  while retaining the main `BuildController` as compile authority.
- Serialize every autosave/manual save and require successful version-token
  writes before compilation.
- Use an 800 ms default debounce bounded to 200-5,000 ms.
- Accept output only when both the main generation and renderer source revision
  remain current, including after asynchronous PDF loading.
- Run Chokidar only in the main process, never follow links, and ignore
  generated, metadata, dependency, coverage, and distribution directories.
- Treat watcher events as informational; they never directly save or compile.
- Suppress matching editor-originated events by recording the saved content
  version, while forwarding later differing or deleted states.
- Scope events and persistence with an opaque path-derived project ID rather
  than exposing canonical paths.
- Persist only validated non-sensitive workspace state and synchronously flush
  it during page hide/unload.
- Add Chokidar because normalized recursive Windows watching and atomic-write
  handling are required by the SRS; pin it exactly under the frozen lockfile.

## 5. Commands run

```text
pnpm install --frozen-lockfile
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:component
pnpm test:integration
pnpm test:coverage
pnpm test:e2e
pnpm build
pnpm check
pnpm audit
git diff --check
pnpm texpulse-doctor -- --custom-bin C:\Users\wijer\AppData\Local\Programs\MiKTeX\miktex\bin\x64
pnpm texpulse-compile -- --project fixtures\minimal-success --root main.tex --timeout 120000
pdfinfo <generated-main.pdf>
pdftotext <generated-main.pdf> -
pdftoppm -png -f 1 -singlefile -r 144 <generated-main.pdf> output\pdf\sprint-6-real
```

The first aggregate run exposed a renderer-reload persistence race. The
workspace flush and isolated E2E assertion were added, the focused E2E passed,
and the complete aggregate gate then passed.

## 6. Test results and counts

- Unit test files: 19 passed.
- Unit tests: 87 passed.
- Component test files: 2 passed.
- Component tests: 2 passed.
- Integration test files: 10 passed.
- Integration tests: 35 passed.
- Coverage run: 31 files and 124 tests passed.
- Aggregate coverage: 93.27% statements, 87.38% branches, 93.38% functions, and
  93.35% lines.
- Electron E2E: 1 passed against the real Electron application process.
- Formatting, linting, strict type checking, production build, aggregate gate,
  frozen install, diff whitespace check, and dependency audit: passed.

The deterministic fake compiler records append-only start/end timestamps. E2E
evidence confirms rapid edits coalesce, queued builds do not overlap, only the
newest source becomes current, manual compile works with auto-build disabled,
and editing remains responsive during a delayed compile.

## 7. Real MiKTeX/PDF evidence

The real doctor found MiKTeX `latexmk` 4.88, native Perl 5.42.2, and SyncTeX
1.21/CLI 1.5. Its isolated compile self-test passed in 731 ms.

A separate real compile used MiKTeX pdfTeX 1.40.28, completed successfully in
666 ms, and produced:

- one A4 page;
- a 15,599-byte PDF;
- extracted text `TeXPulse Studio Sprint 1 compiler smoke test.`;
- a generated `main.synctex.gz`; and
- no PDF JavaScript, encryption, form, or suspect-content flags.

The first page was rendered to PNG and visually inspected at
`output/pdf/sprint-6-real.png`. The text and page number were legible and
matched the source fixture. Default debounce plus real compile measured 1,466
ms, below the three-second `NFR-PERF-004` fixture target. MiKTeX still warns
that updates have not been checked.

## 8. Screenshot evidence

`output/playwright/sprint-6-live-build.png` shows the project tree, CodeMirror
source, PDF.js preview, autosave/auto-build controls, delay selector, build
status, and resizable editor/PDF layout.

`output/playwright/sprint-6-minimum-window.png` was captured at the enforced
880x560 minimum BrowserWindow size. Toolbar wrapping, project tree, editor,
preview, divider, and status remain usable without clipped or overlapping core
controls.

Both screenshots were visually inspected. The deterministic generated PDF and
workspace controls were legible.

## 9. Security review findings

- Electron sandboxing, disabled Node integration, context isolation, permission
  denial, popup denial, navigation denial, and local CSP remain unchanged.
- The frozen bridge exposes exactly nine fixed methods and no unrestricted
  `ipcRenderer`.
- Watcher events contain only a validated opaque project ID, relative path, and
  event kind.
- Chokidar runs only in the main process, does not follow links, and excludes
  generated and dependency directories.
- Watcher events cannot directly trigger saves or builds.
- Automatic saves retain expected-version checks and atomic replacement.
- Main generation checks and renderer source revisions reject stale output.
- Workspace persistence excludes source, PDFs, logs, canonical paths,
  credentials, and compiler capabilities.
- Shell escape remains disabled; timeout, cancellation, process-tree cleanup,
  output isolation, and artifact revalidation remain active.
- `pnpm audit` reports no known vulnerabilities.

## 10. Known limitations

- External changes produce a notice but do not yet provide reload, comparison,
  or merge actions.
- The project tree is not live-refreshed for externally added or deleted files;
  reopening the project refreshes enumeration.
- PDF bytes, build/log state, PDF page/zoom/scroll, and compiler generations are
  not restored across an application restart.
- Watcher failures are logged in the main process rather than surfaced in a
  dedicated renderer diagnostic.
- Full project/global settings schemas and settings UI remain Sprint 9.
- Total compiler stdout/stderr capture, generated-file count/size, and old
  generation cleanup are not yet bounded.
- The application remains limited to trusted local TeX projects until the Sprint
  10 threat model and hardening work are complete.
- MiKTeX reports that updates have not yet been checked, and MakeIndex remains
  runnable without a parseable version.

## 11. Technical debt

- Add safe external reload, comparison, and conflict-resolution actions.
- Refresh project enumeration after bounded watcher add/delete events without
  traversing ignored or linked entries.
- Move full settings persistence into the Sprint 9 user/project settings model.
- Restore PDF page/zoom/scroll state across full application restarts.
- Surface watcher health through a typed diagnostic path.
- Bound total compiler output and generated artifacts and add generation cleanup
  during Sprint 10.
- Add larger-project watcher and editor-latency benchmarks for release evidence.

## 12. Suggested commit message

```text
feat: add Sprint 6 autosave and live compilation
```

## 13. Exact next sprint

Sprint 7: Structured diagnostics. Do not begin it without explicit approval.
