# Sprint 7 Report

## 1. Sprint completed

Sprint 7: Structured diagnostics completed on 2026-06-14. Sprint 8 work was not
started.

## 2. Requirement IDs implemented

- `FR-EDIT-008`
- `FR-BUILD-007` and `FR-BUILD-020`
- `FR-DIAG-001` through `FR-DIAG-008`
- `NFR-REL-003` and `NFR-REL-005`
- Partial `NFR-SEC-009` for bounded display and structured diagnostics
- `NFR-MAINT-002`, `NFR-MAINT-003`, and `NFR-MAINT-005`
- `NFR-UX-001` through `NFR-UX-004` and `NFR-UX-006`
- `NFR-PRIV-001` and `NFR-PRIV-002`
- `AS-002` and `AS-006`

## 3. Files changed

Sprint 7 changes 45 repository files and adds or updates:

- a pure diagnostic model and bounded parser under `src/diagnostics/`;
- strict diagnostic fields on the build IPC response;
- project-session parsing of completed current build logs;
- a source-linked Problems panel with visible severity counts and labels;
- CodeMirror error, warning, and information line decorations and navigation;
- reducer state for Problems/raw-log switching, stale generations, and edit
  invalidation;
- seven golden fixture families for LaTeX, missing packages, references,
  bibliography tools, multi-file projects, and malformed output;
- unit, component, integration, and Electron E2E diagnostic coverage;
- a fake compiler path for deterministic source-linked failures;
- ADR-0009 and updated architecture, security, testing, troubleshooting, status,
  traceability, contributor, agent, and user documentation; and
- this sprint report.

No production dependency or preload method was added.

## 4. Design decisions

- Keep log parsing pure and independent from Electron and filesystem APIs.
- Parse the existing 2 MiB-bounded display log and emit at most 200 diagnostics,
  with 4,096-character messages and 2,048-character excerpts.
- Resolve a diagnostic path only when it matches an enumerated project file, and
  return only the project-relative path.
- Preserve raw output independently and emit a fallback problem for unknown
  failed formats.
- Recognize required LaTeX, `latexmk`, BibTeX, Biber, timeout, and cancellation
  cases, including MiKTeX file-line messages wrapped at 79 columns.
- Reuse main generation and renderer source-revision checks; clear accepted
  diagnostics and markers after any edit.
- Render excerpts as escaped React text and reuse the validated `readTextFile`
  bridge for navigation.
- Keep Problems and raw log mutually exclusive while retaining both controls.

## 5. Commands run

```text
pnpm install --frozen-lockfile
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
git diff --check
pnpm texpulse-doctor -- --custom-bin C:\Users\wijer\AppData\Local\Programs\MiKTeX\miktex\bin\x64
pnpm texpulse-compile -- --project fixtures\syntax-error --root main.tex --timeout 120000
pnpm texpulse-compile -- --project fixtures\minimal-success --root main.tex --timeout 120000
pdfinfo <generated-main.pdf>
pdftotext <generated-main.pdf> -
pdftoppm -png -f 1 -singlefile -r 144 <generated-main.pdf> output\pdf\sprint-7-real
```

Focused Vitest and Playwright commands were also run during implementation. The
first coverage run exposed an unhandled CodeMirror geometry measurement and
insufficient parser branch coverage. JSDOM geometry stubs and additional
behavioral tests repaired both without changing thresholds. The real MiKTeX
failure then exposed a 79-column wrapped error message; continuation handling
was added and the native log was reparsed successfully.

## 6. Test results and counts

- Unit test files: 20 passed.
- Unit tests: 101 passed.
- Component test files: 4 passed.
- Component tests: 5 passed.
- Integration test files: 10 passed.
- Integration tests: 36 passed.
- Coverage run: 34 files and 142 tests passed.
- Aggregate coverage: 94.04% statements, 85.12% branches, 94.51% functions, and
  94.11% lines.
- Electron E2E: 2 passed against the real Electron application process.
- Formatting, linting, strict type checking, frozen install, production build,
  aggregate gate, diff whitespace check, and dependency audit: passed.

The tests cover golden parser formats, malformed output, timeout/cancellation,
bounds, deduplication, explicit severity, native MiKTeX wrapping, multi-file
mapping, stale generations, edit invalidation, safe text rendering, accessible
severity labels, editor markers/focus, raw-log access, retained PDF behavior,
and introduce-error/fix-error cleanup.

## 7. Real MiKTeX/PDF evidence

The real doctor found MiKTeX `latexmk` 4.88, Biber 2.21, native Perl 5.42.2, and
SyncTeX 1.21/CLI 1.5. Its isolated compile self-test passed in 724 ms.

The real syntax-error fixture failed as expected in 983 ms with compiler exit
code 12 and no PDF. Its native log wrapped `Undefined control sequence.` across
two lines at column 79. After repair, the production parser returned exactly one
error linked to `main.tex`, line 4, while preserving the raw excerpt.

A separate real successful compile completed in 719 ms and produced:

- one A4 page;
- a 15,599-byte PDF;
- extracted text `TeXPulse Studio Sprint 1 compiler smoke test.`;
- a generated `main.synctex.gz`; and
- no PDF JavaScript, encryption, forms, or suspect-content flags.

The first page was rendered and visually inspected at
`output/pdf/sprint-7-real.png`. Text and page number were legible and matched
the fixture. MiKTeX still warns that updates have not been checked.

## 8. Screenshot evidence

`output/playwright/sprint-7-problems.png` shows the real Electron workspace
with:

- the failed build and retained `Last successful build` PDF;
- a visible Error label and Problems count;
- the source-linked `main.tex:4:1` diagnostic and raw excerpt;
- the marked and focused CodeMirror source line; and
- the existing sandboxed editor/PDF layout.

The screenshot was visually inspected. Severity, source location, retained PDF
state, editor marker, toolbar controls, and panel content were legible without
clipping or overlap.

## 9. Security review findings

- Electron sandboxing, disabled Node integration, context isolation, permission
  denial, popup/navigation denial, and local CSP remain unchanged.
- The frozen bridge still exposes exactly nine methods; no diagnostic-specific
  renderer capability was added.
- Parser input is the bounded renderer log copy, and output has count and string
  limits enforced again by strict Zod response validation.
- Only enumerated project files can become diagnostic links. Unknown absolute
  paths remain inert text and are never sent as actionable file fields.
- Navigation reuses the canonical, link-rejecting project read service.
- React escapes messages and excerpts; no HTML injection sink was added.
- Main generation checks, renderer source revisions, reducer generation checks,
  and edit invalidation prevent stale diagnostics from remaining current.
- Shell escape remains disabled; timeout, cancellation, process-tree cleanup,
  output isolation, version-token saves, and retained-PDF controls remain
  active.
- Source, logs, diagnostics, and generated artifacts remain local.
- `pnpm audit` reports no known vulnerabilities.

## 10. Known limitations

- Parsing is intentionally best-effort. Unusual packages and custom tool formats
  may produce a locationless fallback and require the raw log.
- File nesting is interpreted conservatively; complex nonstandard TeX log
  structures may associate an old-style location with the most recently opened
  known file.
- Diagnostic links use the project entry list captured when the session opens.
  Newly added files require reopening the project before they can become links.
- Columns are unavailable for many LaTeX formats.
- Raw excerpts intentionally retain original troubleshooting text and may
  contain local absolute paths.
- Total child-process stdout/stderr capture, generated-file count/size, and old
  generation cleanup remain pending Sprint 10.
- The application remains limited to trusted local TeX projects until the Sprint
  10 threat model and hardening work are complete.
- MiKTeX reports that updates have not been checked, and MakeIndex remains
  runnable without a parseable version.

## 11. Technical debt

- Add broader native-log corpus coverage for package-specific and bibliography
  tool variants.
- Refresh bounded project enumeration after safe watcher add/delete events so
  newly created source files can link without reopening.
- Improve nested old-style TeX file-context tracking without treating arbitrary
  parentheses as structural events.
- Bound total process capture and generated artifacts and add generation cleanup
  during Sprint 10.
- Add full multi-file source-navigation E2E coverage in addition to the current
  parser/session integration evidence.

## 12. Suggested commit message

```text
feat: add Sprint 7 structured diagnostics
```

## 13. Exact next sprint

Sprint 8: SyncTeX forward and inverse navigation. Do not begin it without
explicit approval.
