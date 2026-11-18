# Sprint 9 Report

## 1. Sprint completed

Sprint 9: Recipes, settings, setup wizard, and clean builds completed on
2026-06-14. Sprint 10 work was not started.

## 2. Requirement IDs implemented

- `FR-ENV-001` through `FR-ENV-008`
- `FR-EDIT-009`, `FR-SAVE-001`, and `FR-PDF-002`
- `FR-BUILD-009`, `FR-BUILD-013` through `FR-BUILD-015`, `FR-BUILD-018`, and
  `FR-BUILD-019`
- `FR-SET-001` through `FR-SET-006`
- `FR-PACK-003` and `FR-PACK-004`
- `NFR-REL-003`, `NFR-REL-005`, `NFR-SEC-004` through `NFR-SEC-008`
- `NFR-MAINT-002` through `NFR-MAINT-005`
- `NFR-UX-001`, `NFR-UX-002`, `NFR-UX-004`, and `NFR-UX-006`
- `NFR-PRIV-001`, `NFR-PRIV-002`, and `AS-005`

## 3. Files changed

Sprint 9 adds or updates:

- strict global and project settings schemas, migration, safe fallback, atomic
  application-data persistence, and project metadata schema version 2;
- settings, toolchain, clean-build, cleanup, and project-setting IPC contracts
  plus six narrow preload methods;
- first-run setup and full settings UI for tool paths, recipes, root, build
  directory, autosave, auto-build, debounce, timeout, editor font size, PDF
  zoom, and `latexmk` configuration trust;
- per-request timeout and recipe settings, default `-norc`, explicit trust,
  clean `-gg`, and allowlisted generation auxiliary cleanup;
- updated BibTeX/Biber fixtures and a Unicode XeLaTeX fixture;
- unit, component, integration, Electron E2E, and conditional native recipe
  tests;
- ADR-0011 and architecture, security, test, troubleshooting, status,
  traceability, and user documentation; and
- this sprint report.

No production dependency was added.

## 4. Design decisions

- Store global settings under Electron `userData` and project settings under
  `.texpulse/project.json`; keep workspace local storage limited to view state.
- Use a global automatic-build value only as the default for projects without
  metadata; persist project overrides separately.
- Run the existing isolated doctor from first-run setup and distinguish an
  explicit skip from a passed compile.
- Resolve fixed tool names from a user-selected custom executable directory.
- Pass `-norc` by default because `latexmk` configuration files are executable
  Perl. Omit it only after explicit per-project trust.
- Keep `-no-shell-escape` enabled in every recipe and trust mode.
- Use `latexmk -gg` for clean builds through the existing generation, timeout,
  cancellation, and stale-result pipeline.
- Perform auxiliary cleanup in application code using a suffix allowlist under
  validated generation directories. Preserve PDF, log, SyncTeX, and unknown
  output; skip links and junctions.
- Block project-settings changes and maintenance operations when they could race
  with an active or queued build.

## 5. Commands run

```text
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:component
pnpm test:integration
pnpm test:coverage
pnpm test:e2e
pnpm build
pnpm check
pnpm audit
pnpm texpulse-doctor
$env:TEXPULSE_RUN_NATIVE='1'; pnpm exec vitest run tests/integration/native-recipes.test.ts
git diff --check
```

Focused TypeScript, Vitest, Prettier, PDF rendering, environment inspection, and
security-search commands were also run during implementation and review.

## 6. Test results and counts

- Unit test files: 22 passed.
- Unit tests: 114 passed.
- Component test files: 5 passed.
- Component tests: 11 passed.
- Deterministic integration files: 13 passed and 1 conditional file skipped.
- Deterministic integration tests: 54 passed and 5 native tests skipped.
- Coverage run: 40 files passed, 1 conditional file skipped, 179 tests passed,
  and 5 native tests skipped.
- Aggregate coverage: 92.78% statements, 85.22% branches, 94.39% functions, and
  92.82% lines.
- Conditional native recipe file: 1 passed with 5 real MiKTeX tests.
- Electron E2E: 5 passed against the real Electron application process.
- Formatting, linting, strict type checking, production build, aggregate gate,
  diff whitespace check, and dependency audit: passed.

Coverage includes settings migration and invalid data, atomic global
persistence, project trust migration, global defaults, recipe arrays, clean
arguments, cleanup suffixes and links, busy-state rejection, strict IPC,
settings/setup components, and the existing project/build/PDF/diagnostic/SyncTeX
controls.

## 7. Real MiKTeX/PDF evidence

`pnpm texpulse-doctor` reported ready after a real isolated pdfLaTeX self-test.
It used `latexmk` 4.88 with `-norc`, `-no-shell-escape`, and `-synctex=1`,
completed in 732 ms, and produced a 15,599-byte one-page PDF.

The conditional native suite compiled five real workflows:

- pdfLaTeX: `output/pdf/sprint-9-pdflatex.pdf`, 15,599 bytes;
- XeLaTeX with Unicode omega: `output/pdf/sprint-9-xelatex.pdf`, 4,348 bytes;
- LuaLaTeX: `output/pdf/sprint-9-lualatex.pdf`, 5,138 bytes;
- BibTeX with the expected Ada reference: `output/pdf/sprint-9-bibtex.pdf`,
  37,285 bytes; and
- Biber with the expected Grace reference: `output/pdf/sprint-9-biber.pdf`,
  37,348 bytes.

Each PDF's first page was rendered to PNG and visually inspected. Text, Unicode,
and both bibliography entries were present without visible layout defects.
MiKTeX still warns that updates have not been checked.

## 8. Screenshot evidence

- `output/playwright/sprint-9-settings-clean-build.png` shows project settings,
  recipe selection, trust warning, and maintenance controls.
- `output/playwright/sprint-9-setup-wizard.png` shows first-run readiness,
  executable details, and the real-self-test action.

Both screenshots were visually inspected. Labels, readiness text, trust
language, and controls are legible; the dialog supports scrolling for smaller
windows.

## 9. Security review findings

- Electron sandboxing, context isolation, disabled Node integration, local CSP,
  permission denial, and popup/navigation denial remain unchanged.
- The bridge exposes exactly seventeen fixed methods and no raw `ipcRenderer`,
  filesystem, or process primitive.
- New requests and responses use strict schemas and trusted sender/frame checks.
- Custom tool directories resolve only fixed executable names but remain an
  explicit local trust decision.
- `latexmk` configuration stays disabled by default. Enabling it warns that
  configuration is Perl and may execute commands.
- TeX shell escape remains disabled in all recipes and trust modes.
- Normal and clean builds retain argument arrays, `shell: false`, configurable
  timeout, cancellation, process-tree cleanup, generations, and stale rejection.
- Auxiliary cleanup is project-bounded, allowlisted, link-safe, and does not run
  project-controlled cleanup hooks.
- Project-settings and maintenance operations cannot race with active session
  work.
- Source, settings, toolchain checks, and compilation remain local.
- `pnpm audit` reports no known vulnerabilities.

## 10. Known limitations

- Total compiler stdout/stderr, generated-file count, and generation retention
  remain unbounded until Sprint 10.
- The application remains limited to trusted local TeX projects until the Sprint
  10 threat model and hardening work are complete.
- A custom executable directory and enabled `latexmk` configuration expand the
  trusted local input and must be reviewed by the user.
- The setup wizard currently supports explicit skip but does not provide an
  installer for missing MiKTeX or Perl.
- MakeIndex is runnable but does not expose a parseable version.
- MiKTeX reports that updates have not yet been checked.

## 11. Technical debt

- Add bounded process capture, generated-file quotas, and generation retention.
- Add a complete trusted-project threat model and support-log redaction.
- Refresh project entries after safe watcher add/delete events.
- Add recovery for unsaved editor buffers and user-controlled log cleanup.
- Consider dedicated executable-directory controls when tool locations differ.

## 12. Suggested commit message

```text
feat: add Sprint 9 settings and clean-build workflows
```

## 13. Exact next sprint

Sprint 10: Security and recovery hardening. Do not begin it without explicit
approval.
