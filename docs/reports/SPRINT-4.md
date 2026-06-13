# Sprint 4 Report

## 1. Sprint completed

Sprint 4: Secure Electron shell and editor completed on 2026-06-13. Sprint 5
work was not started.

## 2. Requirement IDs implemented

- `FR-PROJ-001` and `FR-PROJ-003`
- `FR-EDIT-001` through `FR-EDIT-007`
- `FR-EDIT-009` for word wrapping; font-size configuration remains later
- `FR-EDIT-010` as an asynchronous editor-state foundation
- `FR-SAVE-003` and `FR-SAVE-005` at editor UI scope
- `NFR-PERF-001`; foundations for `NFR-PERF-002` and `NFR-PERF-005`
- `NFR-SEC-001` through `NFR-SEC-006`, `NFR-SEC-010`, and `NFR-SEC-011`
- `NFR-PRIV-001` and `NFR-PRIV-002`
- `NFR-MAINT-002` through `NFR-MAINT-005`
- `NFR-UX-001`, `NFR-UX-003`, and `NFR-UX-004` for the current surface
- `AS-009`

## 3. Files changed

The final Sprint 4 diff contains 46 paths. It adds:

- Electron main, preload, secure window, and project IPC modules;
- strict IPC channels and Zod contracts;
- the React shell, project explorer, CodeMirror editor, workspace reducer, error
  boundary, and styles;
- Vite renderer/preload builds and Playwright configuration;
- unit, component, integration, and Electron E2E tests;
- pinned React, CodeMirror, Electron, Vite, Zod, Testing Library, jsdom, and
  Playwright dependencies;
- ADR-0006, this report, and updated architecture, security, testing,
  troubleshooting, status, traceability, contributor, and user documentation.

The obsolete Sprint 0 no-E2E placeholder script was removed.

## 4. Design decisions

- Treat the renderer as untrusted and sandbox it with Node integration disabled
  and context isolation enabled.
- Expose a frozen three-method preload API rather than `ipcRenderer`.
- Bundle the sandbox preload as CommonJS and keep its runtime graph to Electron
  plus fixed channel names; the production bundle is 393 bytes.
- Validate trusted web contents, main frame, strict requests, and strict
  responses before project operations.
- Keep canonical roots and absolute paths in the main process.
- Deny permissions, popups, webviews, and unexpected navigation.
- Reject Node/Electron imports and common Node globals in renderer source during
  linting.
- Use a local-only CSP. Permit inline styles only for CodeMirror runtime styles;
  inline and evaluated scripts remain denied.
- Keep renderer buffers and view state in a deterministic reducer.
- Allow stale file reads to populate cache without stealing focus from the
  newest selection.
- Preserve newer local edits when an asynchronous save completes.
- Disable duplicate Save All requests while a save is active.
- Lazy-load the 392 KB CodeMirror editor chunk from the 201 KB application
  shell.

## 5. Commands run

```text
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
pnpm install --frozen-lockfile --dir <isolated-copy>
node node_modules/electron/install.js  # isolated local-store repair
pnpm --dir <isolated-copy> check
pnpm --dir <isolated-copy> audit
```

Playwright interactive Electron QA also exercised Save All, conflicts, notice
dismissal, file switching, cursor/scroll restoration, and compact layout.

## 6. Test results and counts

- Unit test files: 16 passed.
- Unit tests: 66 passed.
- Component test files: 1 passed.
- Component tests: 1 passed.
- Integration test files: 7 passed.
- Integration tests: 21 passed.
- Coverage run: 24 files and 88 tests passed.
- Aggregate coverage: 91.07% statements, 85.71% branches, 92.95% functions, and
  91.21% lines.
- Electron E2E: 1 passed against the real application process.
- Formatting, linting, strict type checking, production builds, aggregate gate,
  and dependency audit: passed.
- Isolated frozen install, complete gate, Electron E2E, and audit: passed.

The isolated install reused an incomplete Electron side-effects record from the
earlier interrupted local download. Running the allowed Electron install script
directly restored `dist` from the checksum-verified cache; the subsequent full
gate passed. This was a local pnpm-store condition, not a source change.

## 7. Real MiKTeX/PDF evidence

Not applicable to Sprint 4. This sprint intentionally added no compiler UI or
PDF viewer. Existing deterministic compiler tests remained green, and no new
real compilation or PDF claim is made.

## 8. Screenshot evidence

- `output/playwright/sprint-4-editor.png` shows the desktop project hierarchy,
  active file, LaTeX highlighting, Save controls, status bar, and saved notice.
- `output/playwright/sprint-4-compact.png` shows the editor at the minimum
  window size without document overflow or obscured controls.

Both screenshots were visually inspected. Text, hierarchy, active and modified
states, controls, editor gutters, and status information were legible without
clipping or overlap.

## 9. Security review findings

- Renderer `require` and `process` are absent in E2E.
- The renderer bridge exposes exactly open, read, and write methods.
- BrowserWindow enables sandboxing, context isolation, and web security while
  disabling Node integration, webviews, and production DevTools.
- Every channel checks the trusted web contents and main frame.
- Unexpected no-argument payloads and malformed strict objects are rejected.
- Traversal requests return `path-escape` and produce a security diagnostic.
- The renderer receives no canonical project root.
- Renderer lint rules reject Node/Electron imports and common Node globals.
- External changes produce a conflict, preserve the unsaved buffer, and leave
  the external file intact.
- Permissions, navigation, popups, and webviews are denied.
- CSP blocks network connections, external bases, objects, forms, inline
  scripts, and evaluated scripts.
- `pnpm audit` reports no known vulnerabilities.

## 10. Known limitations

- Manual compilation, PDF preview, diagnostics, and SyncTeX UI are Sprint 5 or
  later work.
- External changes are detected during versioned save attempts; there is no live
  watcher or reload/keep/compare workflow yet.
- File create, rename, move, and delete services are not exposed in this editor
  sprint.
- Recent projects, root override, autosave, configurable font size, diagnostics,
  and dirty-close protection are not yet connected.
- Measured sub-50 ms input latency and a 1,000-file UI benchmark remain future
  performance evidence.
- Compiler output remains unbounded and old build generations lack cleanup.
- MiKTeX still reports that updates have not been checked.
- The package workflow emits an upstream Node `url.parse()` deprecation warning.

## 11. Technical debt

- Add deterministic UI coverage for open-project cancellation, write conflicts,
  and internal IPC failures.
- Add live filesystem notifications and explicit reload/keep/compare actions.
- Add a dirty-project close/switch confirmation before broader file operations.
- Benchmark and, if necessary, virtualize very large project trees.
- Add measured editor input latency evidence on the reference Windows machine.
- Recreate the pnpm store if the incomplete local Electron side-effects record
  recurs.

## 12. Suggested commit message

```text
feat: add Sprint 4 secure Electron editor
```

## 13. Exact next sprint

Sprint 5: Manual compilation and PDF preview. Do not begin it without explicit
approval.
