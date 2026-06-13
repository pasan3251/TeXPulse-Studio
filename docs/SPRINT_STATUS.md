# Sprint Status

| Sprint       | Status                     | Summary                                                 |
| ------------ | -------------------------- | ------------------------------------------------------- |
| Sprint 0     | Complete on 2026-06-13     | Repository, requirements, and engineering controls      |
| Sprint 1     | Complete on 2026-06-13     | Toolchain probe and minimal compile CLI                 |
| Sprint 2     | Complete on 2026-06-13     | Build orchestration, cancellation, timeout, generations |
| Sprint 3     | Complete on 2026-06-13     | Project model and safe filesystem service               |
| Sprint 4     | Complete on 2026-06-13     | Secure Electron shell and editor                        |
| Sprint 5     | Awaiting explicit approval | Manual compilation and PDF preview                      |
| Sprints 6-14 | Not started                | See `docs/SRS.md`                                       |

## Completed scope

Sprint 0 established Git, pnpm, strict TypeScript, formatting, linting, unit
tests, build checks, Windows CI, required documentation, ADRs, and a
deterministic health check. See `reports/SPRINT-0.md`.

Sprint 1 adds a shell-free toolchain doctor and minimal compiler CLI outside
Electron. See `reports/SPRINT-1.md`. No Electron editor or PDF viewer has been
implemented.

Sprint 2 adds a per-project build controller, generation-isolated outputs,
newest-only queueing, stale-result rejection, retained last-successful metadata,
timeout, cancellation, and process-tree cleanup. See `reports/SPRINT-2.md`.

Sprint 3 adds canonical project boundaries, ignored file enumeration, UTF-8
CRUD, root detection, atomic versioned saves, external-change conflicts,
validated project metadata, and recent-project persistence. See
`reports/SPRINT-3.md`. No Electron shell or editor has been implemented.

Sprint 4 adds a sandboxed Electron shell, narrow validated preload/IPC
contracts, project hierarchy, CodeMirror editor, modified state, Save and Save
All, cursor/scroll restoration, external-change notices, component tests, and a
real Electron E2E workflow. See `reports/SPRINT-4.md`. Compiler UI and PDF
preview were not started.

## Current environment limitation

MiKTeX reports that updates have not yet been checked. MakeIndex is runnable but
does not report a parseable version. Compiler output remains unbounded until
security hardening, and old generation directories do not yet have a cleanup
policy. The editor detects external changes during versioned save attempts; live
filesystem watching and reload/compare actions remain future work.
