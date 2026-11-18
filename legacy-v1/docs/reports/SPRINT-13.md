# Sprint 13 Report

## 1. Sprint completed

Sprint 13: Templates, local history, and Git awareness completed on 2026-06-14
as a narrow read-only Git-status slice. Sprint 14 work was not started.

This sprint intentionally did not implement templates, local revision history,
diff views, commit assistance, collaboration, compiler changes, editor
replacement, or PDF-viewer changes beyond preserving existing behavior.

## 2. Requirement IDs implemented

- Optional `SRS.md` section 10.12: Git status and commit assistance, limited to
  read-only Git status
- `SRS.md` section 16 Sprint 13 brief: read-only Git status without compromising
  source safety
- `NFR-REL-005`
- `NFR-SEC-001`, `NFR-SEC-004` through `NFR-SEC-006`
- `NFR-MAINT-002`, `NFR-MAINT-003`, and `NFR-MAINT-005`
- `NFR-UX-004`
- `NFR-PRIV-001` and `NFR-PRIV-002`

## 3. Files changed

Sprint 13 adds or updates:

- a shell-free, timed, bounded `git status --porcelain=v1 -b` service under the
  active project session;
- strict Git-status request/response schemas, IPC handler, preload API, and
  typed renderer contract;
- a status-bar Git summary that shows branch, ahead/behind state, and aggregate
  change counts without exposing file paths;
- refresh triggers after project open, save, project settings, project
  mutations, and watcher notices;
- unit parser/label tests, real temporary-repository integration coverage,
  project IPC coverage, and updated bridge-key checks for development and
  packaged Electron;
- documentation updates for architecture, security, threat model, test plan,
  README, sprint status, and requirement traceability; and
- this sprint report.

No production dependency was added.

## 4. Design decisions

- Keep Git awareness read-only for Sprint 13. Commit assistance and diff views
  remain deferred because they would expand source mutation and review
  workflows.
- Execute `git` through `NodeProcessRunner` with an argument array, bounded
  output, timeout, `shell: false`, and the canonical project root as `cwd`.
- Return only summary counts and branch metadata. The renderer receives no Git
  path list and no filesystem capability.
- Treat missing Git, timeouts, oversized output, non-repositories, and Git
  failures as explicit status states rather than fatal application errors.
- Refresh status from existing project lifecycle events without making Git
  status a save, compile, watcher, or mutation trigger.

## 5. Commands run

```text
pnpm format
pnpm exec vitest run tests/unit/git-status.test.ts tests/unit/git-status-label.test.ts tests/integration/git-status.test.ts tests/integration/project-ipc.test.ts
pnpm typecheck
pnpm lint
pnpm format:check
pnpm check
pnpm audit:dependencies
pnpm test:packaged
git diff --check
```

`pnpm check` expanded to formatting, linting, strict type checking, unit,
component, integration, performance, coverage, Electron E2E, and production
build checks.

## 6. Test results and counts

- Focused Sprint 13 suite: 4 files and 26 tests passed.
- Unit: 29 files and 137 tests passed.
- Component: 7 files and 18 tests passed.
- Deterministic integration: 17 files passed, 1 conditional file skipped, 84
  tests passed, and 7 native tests skipped.
- Performance: 1 file and 3 tests passed.
- Coverage: 53 files passed, 1 conditional file skipped, 239 tests passed, and 7
  native tests skipped.
- Coverage totals: 93.53% statements, 85.13% branches, 95.39% functions, and
  93.55% lines.
- Development Electron E2E: 7 passed.
- Packaged installed lifecycle: 2 passed.
- Formatting, linting, strict type checking, production build, aggregate check,
  dependency audit, packaged installer build, installed verification, uninstall,
  and diff whitespace check: passed.

## 7. Native MiKTeX/PDF evidence

Sprint 13 did not change compilation, SyncTeX, or PDF rendering behavior. The
packaged installed lifecycle still completed its automated setup, edit, compile,
render, reopen, and previous-settings checks, but no additional manual PDF
visual inspection was required for this Git-status-only slice.

## 8. Security review findings

- The complete diff was reviewed against the SRS and project security rules.
- Electron sandboxing, disabled Node integration, context isolation, CSP,
  permission denial, and navigation denial remain unchanged.
- The frozen preload bridge now exposes thirty-two fixed methods, adding one
  no-argument read-only Git-status method.
- Git status requests and responses use strict schemas and trusted sender/frame
  checks.
- Git execution uses an argument array and no ordinary shell.
- The renderer receives bounded summary data only: state, branch/upstream,
  ahead/behind, aggregate counts, and a bounded message.
- No source writes, commits, staging, remote operations, telemetry, network
  service, updater, or production dependency was added.

No unresolved Sprint 13 blocker remains.

## 9. Known limitations

- Git commit assistance, staging, diff views, local revision history, and
  project snapshots remain deferred.
- Git status depends on a local `git` executable being available on `PATH`.
- Counts are scoped to `git status -- .` from the active project root; branch
  metadata still reflects the containing repository.
- Non-English Git error output may be reported as unavailable rather than
  specifically as "not a repository".
- The release candidate remains unsigned and the broader Sprint 12 limitations
  still apply.

## 10. Technical debt

- Add commit assistance only after a separate source-safety design covers
  staging, author identity, diff review, and conflict handling.
- Add path-level diff or local-history views only with explicit data retention
  and privacy rules.
- Consider more precise non-repository detection if localized Git output becomes
  a supported scenario.

## 11. Suggested commit message

```text
feat: add Sprint 13 read-only Git status
```

## 12. Exact next sprint

Sprint 14: Collaboration research prototype. Do not begin it without a separate
collaboration SRS, transport decision, remote-peer threat model, and explicit
approval.
