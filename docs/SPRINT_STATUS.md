# Sprint Status

| Sprint       | Status                     | Summary                                                 |
| ------------ | -------------------------- | ------------------------------------------------------- |
| Sprint 0     | Complete on 2026-06-13     | Repository, requirements, and engineering controls      |
| Sprint 1     | Complete on 2026-06-13     | Toolchain probe and minimal compile CLI                 |
| Sprint 2     | Awaiting explicit approval | Build orchestration, cancellation, timeout, generations |
| Sprints 3-14 | Not started                | See `docs/SRS.md`                                       |

## Completed scope

Sprint 0 established Git, pnpm, strict TypeScript, formatting, linting, unit
tests, build checks, Windows CI, required documentation, ADRs, and a
deterministic health check. See `reports/SPRINT-0.md`.

Sprint 1 adds a shell-free toolchain doctor and minimal compiler CLI outside
Electron. See `reports/SPRINT-1.md`. No Electron editor or PDF viewer has been
implemented.

## Current environment limitation

MiKTeX reports that updates have not yet been checked. MakeIndex is runnable but
does not report a parseable version. Full compiler timeout, cancellation, and
process-tree cleanup remain Sprint 2 work.
