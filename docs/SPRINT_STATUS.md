# Sprint Status

| Sprint       | Status                     | Summary                                            |
| ------------ | -------------------------- | -------------------------------------------------- |
| Sprint 0     | Complete on 2026-06-13     | Repository, requirements, and engineering controls |
| Sprint 1     | Awaiting explicit approval | Toolchain probe and minimal compile CLI            |
| Sprints 2-14 | Not started                | See `docs/SRS.md`                                  |

## Completed scope

Sprint 0 established Git, pnpm, strict TypeScript, formatting, linting, unit
tests, build checks, Windows CI, required documentation, ADRs, and a
deterministic health check. See `reports/SPRINT-0.md`.

No compiler, Electron editor, or PDF viewer was implemented.

## Current environment limitation

MiKTeX 25.12 and `latexmk.exe` are installed, but `latexmk` cannot run until a
native Windows Perl interpreter is installed. This must be resolved or handled
explicitly during Sprint 1.
