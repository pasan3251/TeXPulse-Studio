# Sprint 2 Report

## 1. Sprint completed

Sprint 2: Build orchestration, cancellation, timeout, and generations completed
on 2026-06-13. Sprint 3 work was not started.

## 2. Requirement IDs implemented

- `FR-BUILD-004` through `FR-BUILD-010`
- `FR-BUILD-016` and `FR-BUILD-017` at compiler-service scope
- `FR-BUILD-002` and `FR-BUILD-003` as debounce foundations
- `NFR-PERF-003`
- `NFR-REL-001` through `NFR-REL-003`
- `NFR-REL-005`
- `NFR-SEC-008`
- `AS-003` and `AS-004` at service/CLI scope

## 3. Files changed

The Sprint 2 diff contains 25 files. It adds the build controller and contracts,
extends the process and compiler layers, updates the compile CLI, adds timeout
and process-cleanup fixtures/tests, records ADR-0004, and updates repository
documentation and traceability.

## 4. Design decisions

- Scope one build controller to one project.
- Assign UUID build IDs and monotonically increasing generations.
- Run one active compile and retain only the newest pending request.
- Isolate output under a generation-and-build-ID directory.
- Reject stale results and adapter identity mismatches from current state.
- Retain metadata for the latest successful, non-stale PDF.
- Pass cancellation through the adapter with `AbortController`.
- Use direct `taskkill.exe /T /F` on Windows and process groups on POSIX.
- Return CLI exit code 124 for timeout and 130 for cancellation.

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
pnpm texpulse-compile -- --help
pnpm texpulse-doctor -- --custom-bin C:\Strawberry\perl\bin --skip-self-test
node dist/cli/compile.js --project fixtures\minimal-success --root main.tex --custom-bin C:\Strawberry\perl\bin --timeout 10000
node dist/cli/compile.js --project fixtures\timeout --root main.tex --custom-bin C:\Strawberry\perl\bin --timeout 1000
pdfinfo <generated-main.pdf>
pdftotext <generated-main.pdf> -
pdftoppm -png -f 1 -singlefile -r 144 <generated-main.pdf> ...
git diff --check
```

## 6. Test results and counts

- Unit test files: 10 passed.
- Unit tests: 51 passed.
- Integration test files: 3 passed.
- Integration tests: 8 passed.
- Coverage run: 13 files and 59 tests passed.
- Aggregate pure-module coverage: 97.81% statements, 93.79% branches, 96.77%
  functions, and 97.77% lines.
- Build-controller coverage: 97.89% statements, 92.75% branches, 93.33%
  functions, and 97.89% lines.
- E2E: no applicable UI surface; status command passed.
- Formatting, linting, strict type checking, build, and aggregate gate: passed.
- Dependency audit: no known vulnerabilities.
- Clean-clone frozen install, complete gate, and audit: passed.

## 7. Real MiKTeX/PDF evidence

- The controller compiled `fixtures/minimal-success/main.tex` through MiKTeX in
  724 ms.
- The result included build ID, generation 1, exit code 0, and readable PDF,
  log, and SyncTeX paths in a generation-isolated directory.
- `pdfinfo` reported one unencrypted A4 page, PDF 1.5, produced by MiKTeX
  pdfTeX.
- Extracted text matched `TeXPulse Studio Sprint 1 compiler smoke test.`
- `fixtures/timeout/main.tex` was terminated after the configured 1,000 ms
  timeout; the result completed in 1,269 ms with status `timed-out`, CLI exit
  code 124, a retained log, no PDF, and zero new compiler processes remaining.

## 8. Screenshot evidence

The generated PDF was rendered at 144 DPI and visually inspected. The expected
sentence and page number are legible with no clipping, overlap, corruption, or
unexpected page content. There is no application UI screenshot because Electron
remains out of scope.

## 9. Security review findings

- Compiler and cleanup commands use executable-plus-argument arrays with
  `shell: false`.
- Cancellation and timeout wait for process-tree cleanup before returning.
- Integration tests verify both the fake parent and descendant process IDs are
  gone.
- Generation output paths use restricted internal build IDs and remain inside
  the validated project build directory.
- Adapter results with mismatched IDs or generations are converted to failures.
- Stale results cannot update current or last-successful metadata.
- No critical or high dependency vulnerability is known.

## 10. Known limitations

- One-controller-per-project ownership is an application composition rule until
  the main-process project service is implemented.
- Compiler output is not yet bounded.
- Generation directories accumulate; safe cleanup is scheduled for later work.
- Timeout starts when the compiler process is spawned, after path/tool checks.
- The CLI handles `Ctrl+C`; no Electron cancellation UI exists.
- MiKTeX reports that updates have not been checked.
- MakeIndex does not expose a parseable version.

## 11. Technical debt

- Add a main-process registry that owns exactly one controller per canonical
  project.
- Add bounded stdout/stderr capture during security hardening.
- Define retention and cleanup policy for old generation directories.
- Integrate save state before automatic build requests in Sprint 6.
- Add UI-facing diagnostics for cleanup failures in later sprints.

## 12. Suggested commit message

```text
feat: add Sprint 2 build orchestration and process cleanup
```

## 13. Exact next sprint

Sprint 3: Project model and safe filesystem service. Do not begin it without
explicit approval.
