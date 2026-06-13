# Test Plan

## Sprint 4 scope

Sprint 4 verifies all existing compiler/project controls plus the secure
BrowserWindow configuration, preload/API contracts, trusted-sender IPC, renderer
workspace state, project hierarchy, modified indicators, CodeMirror editing,
versioned saves, external-change notices, and the real Electron open/edit/save
workflow.

| Check        | Command                 | Current evidence                                      |
| ------------ | ----------------------- | ----------------------------------------------------- |
| Formatting   | `pnpm format:check`     | Prettier checks repository text files                 |
| Linting      | `pnpm lint`             | ESLint checks TS, TSX, configuration, and tests       |
| Strict types | `pnpm typecheck`        | Strict main, preload, renderer, and test contracts    |
| Unit tests   | `pnpm test:unit`        | Core services, window options, tree, workspace state  |
| Component    | `pnpm test:component`   | Hierarchy, active/modified states, inert link entries |
| Integration  | `pnpm test:integration` | Project/compiler processes and validated Electron IPC |
| Coverage     | `pnpm test:coverage`    | Enforces 85% aggregate statements and branches        |
| E2E          | `pnpm test:e2e`         | Real Electron open, edit, save, and bridge isolation  |
| Build        | `pnpm build`            | Main, renderer chunks, and sandbox preload bundle     |
| Aggregate    | `pnpm check`            | Runs every current gate in sequence                   |

## Determinism

- Automated tests use no network or MiKTeX and avoid arbitrary sleeps.
- The strict-mode test creates an isolated temporary TypeScript source and
  requires diagnostic `TS7006`.
- The CI test parses `.github/workflows/ci.yml` and verifies the Windows runner.
- Integration tests execute a Node-based fake compiler and preserve spaces and
  shell metacharacters as distinct arguments.
- Build-controller tests use fake timers and controlled promises rather than
  arbitrary sleeps.
- Process-cleanup tests launch a parent and descendant, then verify both process
  IDs are gone after cancellation and timeout.
- Project tests use isolated temporary directories and cover spaces, Unicode,
  malformed metadata, ignored output, external edits/deletion, links or
  junctions, and deterministic read-only failure.
- Electron E2E uses an isolated temporary project and a development-only test
  folder override, verifies Node globals are absent, persists an edit, captures
  a screenshot, closes Electron, and removes the fixture.
- Interactive Electron QA covers Save All, stale external writes, notice
  dismissal, file switching, cursor/scroll restoration, and compact layout.
- Real MiKTeX smoke evidence is run separately from deterministic automation.

## Later test levels

Sprint 5 adds deterministic fake-compiler UI tests and PDF rendering checks.
Performance benchmarks for 1,000-file projects and measured editor input latency
remain later release evidence. Real MiKTeX results will always be labeled
separately and generated PDFs will be inspected.

## Clean-state procedure

1. Copy only non-ignored repository files to an empty directory.
2. Run `pnpm install --frozen-lockfile`.
3. Run `pnpm check`.
4. Run the conditional real doctor/compile smoke test when MiKTeX and Perl are
   available.
5. Record the result in the sprint report.
