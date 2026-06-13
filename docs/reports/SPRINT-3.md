# Sprint 3 Report

## 1. Sprint completed

Sprint 3: Project model and safe filesystem service completed on 2026-06-13.
Sprint 4 work was not started.

## 2. Requirement IDs implemented

- `FR-PROJ-001`, `FR-PROJ-003` through `FR-PROJ-011` at service scope
- `FR-SAVE-002` through `FR-SAVE-005` at service scope
- `FR-SET-002` through `FR-SET-005` for project metadata fields
- `NFR-PERF-005` and `NFR-PERF-006`
- `NFR-REL-004`
- `NFR-SEC-006`
- `NFR-COMP-003`
- `NFR-MAINT-003`
- `AS-009` at service scope

## 3. Files changed

The Sprint 3 diff contains 26 files. It adds seven typed project modules, six
unit/integration test files, ADR-0005, this report, coverage configuration, and
updates to repository guidance, architecture, security, testing, status, and
traceability documentation.

## 4. Design decisions

- Canonicalize every opened project root.
- Accept only relative project paths that remain below the canonical root.
- List internal symbolic links and junctions but never traverse or mutate
  through them.
- Ignore common generated/dependency directories and the configured project
  build directory, including Windows case-insensitive path matches.
- Treat editor files as bounded valid UTF-8 text.
- Return SHA-256 content versions and require the expected version before
  replacement.
- Save through a synced same-directory temporary file and atomic rename.
- Use a create-only hard link so new files cannot replace a concurrent entry.
- Validate schema-versioned project metadata and fall back safely with issues.
- Keep recent-project storage separate at an injected application-data path.
- Defer live watching and conflict UI until the Electron/editor sprint.

## 5. Commands run

```text
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:coverage
pnpm test:e2e
pnpm build
pnpm check
pnpm audit
git diff --check
pnpm install --frozen-lockfile --dir <isolated-copy>
pnpm --dir <isolated-copy> check
pnpm --dir <isolated-copy> audit
```

## 6. Test results and counts

- Unit test files: 13 passed.
- Unit tests: 60 passed.
- Integration test files: 6 passed.
- Integration tests: 19 passed.
- Coverage run: 19 files and 79 tests passed.
- Aggregate coverage: 92.89% statements, 88.40% branches, 96.29% functions, and
  93.10% lines.
- Covered project modules: 87.57% statements, 82.44% branches, 95.65% functions,
  and 88.09% lines.
- E2E: no applicable UI surface; status command passed.
- Formatting, linting, strict type checking, build, and aggregate gate: passed.
- Dependency audit: no known vulnerabilities.
- Isolated frozen install, complete gate, and audit: passed.

## 7. Real MiKTeX/PDF evidence

Not applicable to Sprint 3. This sprint changed only project filesystem and
metadata services. Existing deterministic compiler tests remained green, and no
claim of a new real MiKTeX compilation is made.

## 8. Screenshot evidence

Not applicable. Sprint 3 has no Electron, editor, or PDF viewer surface.

## 9. Security review findings

- Traversal, absolute, drive-qualified, and NUL-containing project paths are
  rejected.
- Existing path components are inspected without following links.
- Real paths must remain below the canonical project root.
- Metadata access uses the same project boundary and rejects a linked
  `.texpulse` directory.
- Enumeration safely reports a linked `.texpulse` entry without following it.
- Invalid UTF-8, embedded NUL data, and text files above 10 MiB are rejected.
- External edits cause a typed conflict and preserve external content.
- Read-only writes fail explicitly.
- Temporary files are cleaned up after write or replacement failures.
- No production dependency or network capability was added.
- No critical or high dependency vulnerability is known.

## 10. Known limitations

- Project enumeration returns a flat typed list; the hierarchical display is
  Sprint 4 UI work.
- External-change detection is version based and checked on demand; live
  filesystem notifications are deferred until editor integration.
- Confirmation dialogs for destructive operations require the future UI.
- Same-user concurrent path retargeting cannot be eliminated completely with
  path-based Node APIs and remains part of the Sprint 10 threat model.
- Recent-project storage is implemented but not yet connected to Electron app
  data.
- Project metadata contains the Sprint 3 root, recipe, auto-build, and build
  directory subset; remaining settings arrive in later sprints.
- Compiler output remains unbounded and generation cleanup remains future work.

## 11. Technical debt

- Add the typed Electron IPC wrapper around `ProjectService` in Sprint 4.
- Convert the flat project entries into renderer tree state without granting
  renderer filesystem access.
- Add live file watching and user-facing reload/keep/compare conflict handling.
- Connect recent projects to the application-data directory.
- Expand metadata migration when a schema version after version 1 is introduced.
- Investigate the upstream Node `url.parse()` deprecation warning emitted during
  the clean-copy package workflow.

## 12. Suggested commit message

```text
feat: add Sprint 3 safe project filesystem service
```

## 13. Exact next sprint

Sprint 4: Secure Electron shell and editor. Do not begin it without explicit
approval.
