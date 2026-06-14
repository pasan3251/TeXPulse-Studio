# Sprint 10 Report

## 1. Sprint completed

Sprint 10: Security and recovery hardening completed on 2026-06-14. Sprint 11
work was not started.

## 2. Requirement IDs implemented

- `FR-REC-001` through `FR-REC-008`
- `FR-DIAG-001` and `FR-DIAG-006`
- `NFR-REL-003` through `NFR-REL-005`
- `NFR-SEC-001`, `NFR-SEC-004` through `NFR-SEC-012`
- `NFR-PRIV-001` through `NFR-PRIV-004`
- `NFR-MAINT-002` through `NFR-MAINT-005`
- `NFR-UX-001`, `NFR-UX-004`, and `NFR-UX-006`
- `AS-008` and `AS-009`

## 3. Files changed

Sprint 10 adds or updates:

- bounded child-process capture and output-limit termination;
- generated-output count, per-file, aggregate-byte, link, and file-type checks;
- link-safe rejected-output cleanup and eight-generation retention;
- bounded display-log reads and strict IPC log limits;
- exact renderer navigation policy, popup denial, drag/drop navigation denial,
  and a stricter local Content Security Policy;
- atomic, project-scoped, bounded recovery storage and explicit restore/discard
  UI;
- editor synchronization that restores recovered text without reporting it as a
  user keystroke or writing the project;
- structured rotating application logs, redacted support export, and recovery or
  log cleanup controls;
- five new narrow recovery/support preload methods, bringing the frozen bridge
  to twenty-two methods;
- high-severity dependency audit in CI;
- unit, component, integration, and abnormal-shutdown Electron E2E coverage;
- `THREAT_MODEL.md`, ADR-0012, and updated architecture, security, test,
  troubleshooting, status, traceability, contributor, agent, and user
  documentation; and
- this sprint report.

No production dependency was added.

## 4. Design decisions

- Treat renderer, project input, recovery data, compiler output, logs, and PDFs
  as untrusted.
- Terminate compiler trees after 8 MiB of aggregate stdout/stderr capture.
- Reject accepted generations over 4,096 regular files, 128 MiB per file, or 512
  MiB total, and remove rejected output without following links.
- Retain no more than eight recognized generations while preserving current and
  visible successful output.
- Store recovery under Electron `userData`, keyed by opaque project ID and
  limited to 20 buffers, 2 MiB each, and 10 MiB total.
- Restore recovered text only to dirty editor buffers after explicit review.
  Continue to require a version-token Save before source changes.
- Log bounded structured events without source content by default. Rotate one
  prior 1 MiB log, export only on user action, and redact home/project paths
  where practical.
- Deny all renderer-originated external navigation because no current product
  workflow requires external URL access.
- Keep TeX shell escape disabled in every recipe and trust mode.
- Document that output quotas are post-process checks and not an OS-level TeX
  sandbox.

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
pnpm audit:dependencies
pnpm texpulse-doctor
pnpm texpulse-compile -- --project <Sprint 10 evidence directory> --root main.tex --timeout 120000
$env:TEXPULSE_RUN_NATIVE='1'; pnpm exec vitest run tests/integration/native-recipes.test.ts
pdftoppm -png -f 1 -singlefile <native PDF> <render prefix>
git diff --check
```

Focused Vitest, TypeScript, environment, security-search, screenshot, PDF
rendering, and complete-diff inspection commands were also run.

## 6. Test results and counts

- Unit test files: 26 passed.
- Unit tests: 129 passed.
- Component test files: 6 passed.
- Component tests: 13 passed.
- Deterministic integration files: 14 passed and 1 conditional file skipped.
- Deterministic integration tests: 68 passed and 5 native tests skipped.
- Coverage run: 46 files passed, 1 conditional file skipped, 210 tests passed,
  and 5 native tests skipped.
- Aggregate coverage: 92.97% statements, 85.00% branches, 94.81% functions, and
  93.00% lines.
- Conditional native recipe file: 1 passed with 5 real MiKTeX tests.
- Electron E2E: 6 passed against real Electron application processes.
- Formatting, linting, strict type checking, production build, aggregate gate,
  diff whitespace check, and dependency audit: passed.

Coverage includes process overflow, output quotas, retention, strict recovery
schemas and persistence, support-log rotation/redaction, navigation policy, CSP,
IPC rejection, recovery UI/reducer/editor synchronization, and all prior
project/build/PDF/diagnostic/SyncTeX/settings controls.

## 7. Real MiKTeX/PDF evidence

`pnpm texpulse-doctor` reported ready after a real isolated pdfLaTeX self-test.
It used `latexmk` 4.88 with `-norc`, `-no-shell-escape`, and `-synctex=1`,
completed in 1,159 ms, produced a 15,599-byte one-page PDF and SyncTeX data, and
did not truncate process output.

The conditional native suite passed five real workflows: pdfLaTeX, XeLaTeX,
LuaLaTeX, BibTeX, and Biber.

The Sprint 10 CLI evidence compiled `fixtures/minimal-success` through the
generation-isolated compiler in 1,038 ms. The resulting 15,599-byte PDF was
rendered with MiKTeX `pdftoppm` to
`output/pdf/sprint-10-native-render/main-page-1.png` and visually inspected. The
page text and page number were legible with normal margins and no clipping,
overlap, missing glyphs, or malformed rendering.

MiKTeX still warns that updates have not been checked.

## 8. Screenshot evidence

`output/playwright/sprint-10-recovery-review.png` captures the second Electron
process after abnormal shutdown. It shows the project-relative file, bounded
content preview, explicit statement that restoration does not write project
files, and separate `Discard recovery` and `Restore to editor` actions.

The screenshot was visually inspected. Text, hierarchy, contrast, button labels,
and modal layout are legible without clipping.

## 9. Security review findings

- No known critical or high-severity finding remains in Sprint 10 scope.
- Electron sandboxing, context isolation, disabled Node integration, sender and
  frame checks, strict IPC schemas, permission denial, and popup denial remain
  active.
- The bridge exposes exactly twenty-two fixed methods and no raw filesystem,
  process, `ipcRenderer`, or external-URL primitive.
- CSP denies network connections, objects, frames, forms, external bases,
  manifests, media, and evaluated or inline scripts. The documented CodeMirror
  inline-style exception remains.
- Shell metacharacters remain argument data and TeX shell escape remains
  disabled.
- Process capture, display logs, generated output, retained generations, PDF
  bytes, SyncTeX output, diagnostics, recovery, and application logs are
  bounded.
- Traversal and malformed IPC requests are rejected and recorded without
  exposing external file content.
- Recovery never writes project source automatically and continues to use the
  existing version-token save path.
- Support logs omit source content by default and redact home/project paths on
  export where practical.
- `pnpm audit:dependencies` reports no known vulnerabilities at the configured
  high-severity gate.

## 10. Known limitations

- TeX and explicitly trusted local tools run with the desktop user's
  permissions; TeXPulse does not provide an OS-level compiler sandbox.
- Generated-output quotas are checked after process exit. A hostile project may
  consume transient disk, CPU, or memory before timeout and cleanup.
- Recovery is best effort and limited to 20 dirty buffers, 2 MiB each, and 10
  MiB total.
- Recovery and application logs are local plaintext protected by the Windows
  user profile.
- Raw native compiler logs intentionally retain local paths and may contain TeX
  excerpts for troubleshooting.
- A custom executable directory and enabled `latexmk` configuration remain
  explicit local trust decisions.
- MakeIndex is runnable but does not expose a parseable version.
- MiKTeX reports that updates have not yet been checked.
- Packaging, signing, installer, clean-profile, and installed-path behavior have
  not started.

## 11. Technical debt

- Consider an OS-restricted compiler process or sandbox before accepting
  untrusted projects or any multi-user execution.
- Consider live disk-usage enforcement rather than post-process generation
  inspection.
- Refresh project entries after safe watcher add/delete events.
- Add side-by-side recovery and external-file comparison or merge tools.
- Add configurable recovery retention only if it can remain simple, bounded, and
  privacy preserving.

## 12. Suggested commit message

```text
feat: harden Sprint 10 security and crash recovery
```

## 13. Exact next sprint

Sprint 11: Packaging and first-run experience. Do not begin it without explicit
approval.
