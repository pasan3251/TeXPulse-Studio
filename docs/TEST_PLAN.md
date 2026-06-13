# Test Plan

## Sprint 2 scope

Sprint 2 verifies repository controls, toolchain logic, build state transitions,
generation and stale-result policy, newest-only queueing, timeout, cancellation,
and whole-process-tree cleanup.

| Check        | Command                 | Current evidence                                        |
| ------------ | ----------------------- | ------------------------------------------------------- |
| Formatting   | `pnpm format:check`     | Prettier checks repository text files                   |
| Linting      | `pnpm lint`             | ESLint checks JavaScript and TypeScript                 |
| Strict types | `pnpm typecheck`        | TypeScript strict project check                         |
| Unit tests   | `pnpm test:unit`        | Build states, debounce, queue, stale results, toolchain |
| Integration  | `pnpm test:integration` | Fake compiler, cancellation, timeout, process cleanup   |
| Coverage     | `pnpm test:coverage`    | Enforces 85% statements and branches on pure modules    |
| E2E          | `pnpm test:e2e`         | Explicitly reports no UI surface                        |
| Build        | `pnpm build`            | Emits library modules and both CLI entry points         |
| Aggregate    | `pnpm check`            | Runs every current gate in sequence                     |

## Determinism

- Automated tests use no network, MiKTeX, Electron process, or arbitrary sleep.
- The strict-mode test creates an isolated temporary TypeScript source and
  requires diagnostic `TS7006`.
- The CI test parses `.github/workflows/ci.yml` and verifies the Windows runner.
- Integration tests execute a Node-based fake compiler and preserve spaces and
  shell metacharacters as distinct arguments.
- Build-controller tests use fake timers and controlled promises rather than
  arbitrary sleeps.
- Process-cleanup tests launch a parent and descendant, then verify both process
  IDs are gone after cancellation and timeout.
- Real MiKTeX smoke evidence is run separately from deterministic automation.

## Later test levels

The SRS requires unit, component, integration, E2E, manual, security, and
performance tests as relevant product surfaces arrive. Fake compilers will be
used for deterministic automation. Real MiKTeX results will always be labeled
separately and generated PDFs will be inspected.

## Clean-state procedure

1. Copy only non-ignored repository files to an empty directory.
2. Run `pnpm install --frozen-lockfile`.
3. Run `pnpm check`.
4. Run the conditional real doctor/compile smoke test when MiKTeX and Perl are
   available.
5. Record the result in the sprint report.
