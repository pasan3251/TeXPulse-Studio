# ADR-0008: Live build and project watching

- Status: Accepted
- Date: 2026-06-14

## Context

Sprint 6 adds autosave, debounced automatic compilation, external filesystem
change detection, and workspace restoration. These features cross the sandboxed
renderer, typed preload boundary, privileged project session, and existing
newest-only build controller.

The design must preserve version-token saves, never let stale compiler output
replace a newer result, avoid rebuild loops caused by generated files or the
editor's own writes, and keep renderer persistence free of project source and
canonical local paths.

## Decision

- A pure renderer `LiveBuildCoordinator` owns autosave and automatic-build
  scheduling. Its default debounce is 800 ms and the configured value is bounded
  from 200 to 5,000 ms.
- Saves are serialized. Every automatic or manual compile waits for all dirty
  buffers to save successfully with their latest version tokens.
- The main-process `BuildController` remains the authority for one active build,
  newest-only queueing, cancellation, generations, and stale-result disposition.
- The renderer records an edit revision for each request and rejects a result if
  that revision or the source buffer changed while compilation or PDF loading
  was pending.
- Chokidar 5.0.0 provides native project change events in the main process. The
  watcher does not follow symbolic links, ignores generated and dependency
  directories, and treats events as informational only. Watcher events never
  save or compile directly.
- Internal writes record their resulting content version. Matching watcher
  events are suppressed, while a differing version or deletion is forwarded as
  an external change.
- Watcher notifications cross one fixed preload event channel with only an
  opaque project ID, relative path, and added/changed/deleted kind. The renderer
  ignores notifications for a previous project session.
- The opaque project ID is a truncated SHA-256 digest of the canonical project
  path. It scopes renderer persistence without exposing that path.
- Renderer `localStorage` contains only validated non-sensitive workspace
  preferences: relative open paths, active path, cursor and scroll views, pane
  ratio, and live-build settings. It does not contain source text, PDFs, logs,
  canonical paths, or credentials.

## Alternatives considered

- Main-process debounce was rejected because unsaved renderer buffers are the
  source of truth before a build.
- Direct renderer filesystem watching was rejected because it would weaken the
  Electron privilege boundary.
- Watcher-triggered saves or builds were rejected because generated output and
  external tools could create loops or compile an unsaved editor state.
- Raw `fs.watch` was rejected because its recursive Windows behavior and event
  normalization require more platform-specific logic than Chokidar.
- Project metadata was rejected for workspace UI state because cursor,
  selection, and pane preferences are user-local rather than project-shared.

## Consequences

- The frozen preload API now exposes nine fixed methods.
- Chokidar 5.0.0 is a pinned production dependency and requires Node.js 20.19.0
  or newer; the project baseline is Node.js 24.x.
- External changes are detected promptly, but Sprint 6 only warns and preserves
  unsaved buffers. Reload, comparison, and merge actions remain later work.
- Open files, editor views, pane ratio, and live-build settings survive a
  renderer reload. PDF bytes, logs, and build state are intentionally not
  persisted.
- Watcher failures are logged in the main process and do not compromise the
  project boundary or editor contents.

## Validation

- Fake-timer unit tests cover debounce changes, save ordering, queue handoff,
  manual builds, cancellation, and disposal.
- Watcher unit and integration tests cover internal-write suppression, external
  changes, and ignored generated output.
- Electron E2E covers rapid typing, no overlapping compiler processes,
  newest-result display, auto-build disablement, manual compile, responsive
  editing, stale-result rejection, restoration, minimum-window layout, and
  version-conflict preservation.
- A real MiKTeX `latexmk` build produced and rendered an inspected one-page PDF.
