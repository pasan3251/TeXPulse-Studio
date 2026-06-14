# Sprint Status

| Sprint        | Status                 | Summary                                                 |
| ------------- | ---------------------- | ------------------------------------------------------- |
| Sprint 0      | Complete on 2026-06-13 | Repository, requirements, and engineering controls      |
| Sprint 1      | Complete on 2026-06-13 | Toolchain probe and minimal compile CLI                 |
| Sprint 2      | Complete on 2026-06-13 | Build orchestration, cancellation, timeout, generations |
| Sprint 3      | Complete on 2026-06-13 | Project model and safe filesystem service               |
| Sprint 4      | Complete on 2026-06-13 | Secure Electron shell and editor                        |
| Sprint 5      | Complete on 2026-06-13 | Manual compilation and PDF preview                      |
| Sprint 6      | Complete on 2026-06-14 | Autosave, live compilation, watching, restoration       |
| Sprint 7      | Complete on 2026-06-14 | Structured diagnostics, Problems panel, source links    |
| Sprint 8      | Complete on 2026-06-14 | SyncTeX forward and inverse navigation                  |
| Sprint 9      | Complete on 2026-06-14 | Recipes, settings, setup wizard, clean builds           |
| Sprints 10-14 | Not started            | See `docs/SRS.md`                                       |

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
preview were not started in that sprint.

Sprint 5 adds save-before-compile, manual build and cancellation controls, typed
build/PDF IPC, a main-process project/build session, PDF.js preview,
page/zoom/fit controls, reload-state preservation, raw logs, retained
last-successful output, and validated open/reveal actions. See
`reports/SPRINT-5.md`.

Sprint 6 adds configurable autosave and debounced auto-build, serialized saves,
newest-only live compilation, stale editor-revision rejection, bounded
main-process project watching, external-change notices, workspace restoration,
responsive pane resizing, and rapid-workflow E2E coverage. See
`reports/SPRINT-6.md`.

Sprint 7 adds a bounded pure diagnostic parser for common LaTeX, `latexmk`,
BibTeX, and Biber output; strict typed diagnostic contracts; source-linked
Problems UI; CodeMirror line markers and navigation; stale-diagnostic rejection;
raw-log fallback; golden, malformed, multi-file, component, integration, and
Electron E2E coverage; and native MiKTeX log validation. See
`reports/SPRINT-7.md`.

Sprint 8 adds bounded SyncTeX parsers, a shell-free timed main-process service,
strict forward/inverse IPC, current-artifact and project-path validation, PDF
and editor target markers, multi-file and spaces-in-path coverage, Electron E2E
navigation, and a real MiKTeX/SyncTeX round trip. See `reports/SPRINT-8.md`.

Sprint 9 adds schema-versioned global and project settings, migration and safe
fallback notices, first-run real toolchain setup, custom executable discovery,
per-project pdfLaTeX/XeLaTeX/LuaLaTeX recipes, configurable timeout/editor/PDF
defaults, explicit `latexmk` configuration trust, clean builds, allowlisted
auxiliary cleanup, bibliography fixtures, Electron E2E workflows, and native
MiKTeX recipe evidence. See `reports/SPRINT-9.md`.

## Current environment limitation

MiKTeX reports that updates have not yet been checked. MakeIndex is runnable but
does not report a parseable version. Compiler output and generated-file counts
remain unbounded until security hardening, and old generation directories do not
yet have a retention policy. The renderer log copy is bounded to 2 MiB and PDF
preview to 100 MiB, while structured output is bounded to 200 diagnostics, 4,096
characters per message, 2,048 characters per excerpt, and 512 KiB of parsed
SyncTeX result text. Total child-process output capture remains pending
Sprint 10. The editor detects external changes through a bounded project watcher
and still rejects stale version tokens. Automatic reload, side-by-side
comparison, and merge actions remain future work.
