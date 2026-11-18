# Sprint 5 Report

## 1. Sprint completed

Sprint 5: Manual compilation and PDF preview completed on 2026-06-13. Sprint 6
work was not started.

## 2. Requirement IDs implemented

- `FR-BUILD-001`, `FR-BUILD-004` through `FR-BUILD-013`, `FR-BUILD-016`, and
  `FR-BUILD-017`
- `FR-EDIT-010` and `FR-SAVE-003` at manual-build scope
- `FR-PDF-001` through `FR-PDF-008`
- `FR-DIAG-001` and `FR-DIAG-006`
- `NFR-PERF-001` and `NFR-PERF-007`
- `NFR-REL-001` through `NFR-REL-003`
- `NFR-SEC-004` through `NFR-SEC-008` and `NFR-SEC-011`
- Partial `NFR-SEC-009` for PDF and renderer-log bounds
- `NFR-PRIV-001` and `NFR-PRIV-002`
- Source-to-PDF portions of `AS-001` and `AS-002`

## 3. Files changed

Sprint 5 changes 37 repository paths and adds or updates:

- a main-process `ProjectSession` owning project and build state;
- strict build, cancellation, artifact, PDF-load, open, and reveal contracts;
- a frozen eight-method preload API with opaque artifact tokens;
- save-before-compile, build status, cancellation, and raw-log controls;
- a lazy PDF.js viewer with page, scrolling, zoom, fit-width, fit-page, and
  reload-state preservation;
- current-versus-last-successful PDF state and failed-build retention;
- canonical generation-path and readable-file validation with a 100 MiB PDF
  preview limit and 2 MiB renderer-log limit;
- deterministic valid-PDF fixtures, component/session/IPC tests, and an expanded
  Electron E2E workflow;
- an atomic PID fixture handoff that stabilizes process-tree coverage runs;
- pinned `pdfjs-dist` 6.0.227 and ADR-0007; and
- updated architecture, security, testing, troubleshooting, status,
  traceability, contributor, agent, and user documentation.

## 4. Design decisions

- Keep one `BuildController` with one `ProjectService` in a main-process
  session.
- Save every modified buffer before compiling and abort on save failure or a
  newer edit racing the save.
- Return typed build state and opaque `{ buildId, generation }` artifacts, never
  generated absolute paths as structured capabilities.
- Revalidate artifact identity and canonical generation location before PDF
  read, open, or reveal.
- Load only completed, readable PDF output and retain the previous successful
  bytes across failed builds.
- Mark the preview retained when source changes during or after its build.
- Lazy-load PDF.js and its local worker under `worker-src 'self'`.
- Preserve page, zoom, and approximate scroll state when PDF bytes change.
- Preserve the complete raw log on disk while bounding the renderer copy.
- Add `pdfjs-dist` because the SRS explicitly requires PDF.js; pin it exactly
  and keep it behind the frozen lockfile and audit gate.

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
pnpm texpulse-compile -- --project fixtures\minimal-success --root main.tex --timeout 120000
pdfinfo <generated-main.pdf>
pdftotext <generated-main.pdf> -
pdftoppm -png -f 1 -singlefile -r 144 <generated-main.pdf> output\pdf\sprint-5-real
```

## 6. Test results and counts

- Unit test files: 16 passed.
- Unit tests: 69 passed.
- Component test files: 2 passed.
- Component tests: 2 passed.
- Integration test files: 8 passed.
- Integration tests: 32 passed.
- Coverage run: 26 files and 103 tests passed.
- Aggregate coverage: 91.91% statements, 85.91% branches, 95.65% functions, and
  92.02% lines.
- Electron E2E: 1 passed against the real Electron application process.
- Formatting, linting, strict type checking, build, aggregate gate, frozen
  install, and dependency audit: passed.

The automated compiler and Electron tests use the deterministic Node fake
compiler. It emits a valid one-page PDF and supports controlled failure and
missing-output cases. No automated test depends on MiKTeX.

## 7. Real MiKTeX/PDF evidence

A separate real smoke compile used MiKTeX `latexmk` 4.88 with pdfTeX 1.40.28. It
completed successfully in 1,015 ms with exit code 0 and produced:

- one A4 page;
- a 15,599-byte PDF;
- extracted text `TeXPulse Studio Sprint 1 compiler smoke test.`;
- a generated `main.synctex.gz`; and
- no PDF JavaScript, encryption, form, or suspect-content flags.

The first page was rendered to PNG and visually inspected at
`output/pdf/sprint-5-real.png`. The text and page number were legible and
matched the source fixture. MiKTeX still warns that updates have not been
checked.

## 8. Screenshot evidence

`output/playwright/sprint-5-pdf-preview.png` was captured from the deterministic
Electron E2E workflow and visually compared with the Sprint 4 editor surface. It
shows:

- the project tree and CodeMirror source side by side with the PDF.js preview;
- a legible one-page generated PDF;
- page and zoom controls;
- the `Current build` badge;
- raw generation log output;
- build status and saved state; and
- no clipped or overlapping controls at the captured window size.

The same E2E then forced a compiler failure and asserted that the canvas
remained visible, changed to `Last successful build`, showed `Build: failed`,
and exposed the failure output.

## 9. Security review findings

- Electron sandboxing, disabled Node integration, context isolation, permission
  denial, popup denial, and navigation denial remain unchanged.
- The renderer bridge exposes exactly eight fixed methods and no `ipcRenderer`.
- Every new request and response is strictly schema validated and sender/frame
  checked.
- Compile requests contain only a relative root file.
- PDF actions contain only opaque build identity; absolute artifact paths remain
  main-process values. Raw logs may contain compiler-emitted path text.
- Artifact reads and desktop actions revalidate the visible generation,
  canonical project-relative path, configured generation prefix, and file type.
- PDF preview input is limited to 100 MiB; renderer log display is limited to 2
  MiB while the complete log remains on disk.
- PDF.js and its worker are local-only and the CSP adds only
  `worker-src 'self'`.
- Shell escape remains disabled; compiler timeout, cancellation, generation
  isolation, and stale-result rejection remain active.
- `pnpm audit` reports no known vulnerabilities.

## 10. Known limitations

- Autosave, automatic compilation, debounce controls, persisted pane/viewer
  state, and full build-phase events are Sprint 6.
- Root override, recipe/settings UI, parsed diagnostics, editor markers, and
  SyncTeX navigation are later sprints.
- Total compiler stdout/stderr capture, generated-file count/size, and old
  generation cleanup are not yet bounded.
- The application remains limited to trusted local TeX projects until the Sprint
  10 threat model and hardening work are complete.
- PDF preview transfers the complete bounded byte array through IPC rather than
  streaming.
- Open/reveal behavior depends on Windows PDF association and Explorer and is
  integration-tested with injected desktop handlers rather than launching
  external applications during E2E.
- Source changes conservatively mark a preview retained until another successful
  manual build.
- Raw compiler logs may expose local path and environment text inside the
  sandboxed renderer for troubleshooting.
- MiKTeX reports that updates have not yet been checked.

## 11. Technical debt

- Bound total compiler output and generated artifact count/size in Sprint 10.
- Add generation cleanup policy and retention settings.
- Add parser-backed structured diagnostics without weakening raw-log access.
- Consider transferable or chunked PDF delivery if large local PDFs create
  measurable IPC memory pressure.
- Add real-application conditional smoke automation for environments with a
  verified MiKTeX installation.
- Persist PDF page/zoom/scroll and pane geometry with Sprint 6 workspace state.

## 12. Suggested commit message

```text
feat: add Sprint 5 manual build and PDF preview
```

## 13. Exact next sprint

Sprint 6: Autosave and debounced live compilation. Do not begin it without
explicit approval.
