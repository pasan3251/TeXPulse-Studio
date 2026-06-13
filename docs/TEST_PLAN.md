# Test Plan

## Sprint 6 scope

Sprint 6 verifies all existing controls plus serialized autosave, configurable
debounce, newest-only automatic builds, visible live phases, project watching,
external-change preservation, workspace restoration, responsive editing, and
minimum-window layout.

| Check        | Command                 | Current evidence                                        |
| ------------ | ----------------------- | ------------------------------------------------------- |
| Formatting   | `pnpm format:check`     | Prettier checks repository text files                   |
| Linting      | `pnpm lint`             | ESLint checks TS, TSX, configuration, and tests         |
| Strict types | `pnpm typecheck`        | Strict main, preload, renderer, watcher, and tests      |
| Unit tests   | `pnpm test:unit`        | Coordinator, persistence, watcher, reducer, core state  |
| Component    | `pnpm test:component`   | Project tree and PDF reload state                       |
| Integration  | `pnpm test:integration` | Live flow, watcher, session, compiler, validated IPC    |
| Coverage     | `pnpm test:coverage`    | Enforces 85% aggregate statements and branches          |
| E2E          | `pnpm test:e2e`         | Rapid edit through save, compile, restore, and conflict |
| Build        | `pnpm build`            | Main, renderer chunks, and sandbox preload bundle       |
| Aggregate    | `pnpm check`            | Runs every current gate in sequence                     |

## Determinism

- Automated tests use no network or MiKTeX and avoid arbitrary sleeps.
- The strict-mode test creates an isolated temporary TypeScript source and
  requires diagnostic `TS7006`.
- The CI test parses `.github/workflows/ci.yml` and verifies the Windows runner.
- Integration tests execute a Node-based fake compiler and preserve spaces and
  shell metacharacters as distinct arguments.
- Build-controller tests use fake timers and controlled promises rather than
  arbitrary sleeps.
- Live-build coordinator tests use fake timers and controlled save/build
  promises for debounce, queue, cancellation, and setting changes.
- Project watcher tests use isolated directories and explicit event collection
  for internal-write suppression, external changes, and ignored generated
  output.
- Process-cleanup tests launch a parent and descendant, then verify both process
  IDs are gone after cancellation and timeout.
- Project tests use isolated temporary directories and cover spaces, Unicode,
  malformed metadata, ignored output, external edits/deletion, links or
  junctions, and deterministic read-only failure.
- Electron E2E uses an isolated project and development-only folder/compiler
  overrides. It verifies the nine-method bridge and absent Node globals, rapid
  typing coalescence, queued handoff, non-overlapping compiler trace intervals,
  newest-result display, disabled auto-build plus manual compile, responsive
  editing, stale-result rejection, workspace restoration, minimum-window layout,
  version-conflict preservation, screenshots, clean shutdown, and fixture
  removal.
- PDF component tests use controlled PDF.js document/page/render objects and no
  arbitrary sleeps.
- The fake compiler emits a structurally valid one-page PDF and can
  deterministically fail or omit output.
- The process-tree PID fixture publishes its handoff atomically so coverage runs
  cannot observe partial JSON.
- Real MiKTeX smoke evidence is run separately from deterministic automation.

## Later test levels

Sprint 7 adds structured diagnostics parsing, grouping, navigation, and raw-log
fallback tests. Performance benchmarks for 1,000-file projects and measured
editor input latency remain later release evidence. Real MiKTeX results will
always be labeled separately and generated PDFs will be inspected.

## Clean-state procedure

1. Copy only non-ignored repository files to an empty directory.
2. Run `pnpm install --frozen-lockfile`.
3. Run `pnpm check`.
4. Run the conditional real doctor/compile smoke test when MiKTeX and Perl are
   available.
5. Record the result in the sprint report.
