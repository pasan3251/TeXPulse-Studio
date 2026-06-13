# Sprint 1 Report

## 1. Sprint completed

Sprint 1: Toolchain probe and minimal compile CLI completed on 2026-06-13.
Sprint 2 work was not started.

## 2. Requirement IDs implemented

- `FR-ENV-001` through `FR-ENV-008`
- `FR-BUILD-010` through `FR-BUILD-014` at prototype scope
- `FR-SYNC-001`
- `NFR-SEC-006`
- `NFR-SEC-007`
- `NFR-COMP-001` through `NFR-COMP-004` at current scope
- `NFR-MAINT-002`
- `NFR-MAINT-003`
- `NFR-MAINT-005`
- `AS-005` at CLI scope

`NFR-COMP-003` remains partial because spaces are tested but the dedicated
Unicode fixture is scheduled later.

## 3. Files changed

The Sprint 1 diff contains 43 files:

- Compiler and process modules under `src/compiler/` and `src/process/`.
- Tool discovery, version parsing, doctor, and readiness modules under
  `src/toolchain/`.
- JSON CLI entry points under `src/cli/`.
- Minimal fixture under `fixtures/minimal-success/`.
- Unit and integration tests under `tests/`.
- Package scripts, coverage configuration, lockfile, ignore rules, ADR-0003,
  architecture, security, test, troubleshooting, status, and traceability docs.

## 4. Design decisions

- Define a typed `CompilerAdapter` and initial `MiktexCompilerAdapter`.
- Use `spawn(executable, args, { shell: false })` for every process.
- Prefer `--custom-bin`, then `PATH`, and propagate the custom directory into
  child `PATH` for `latexmk` engine and Perl lookup.
- Use fixed `latexmk` recipe arguments with `-norc`, `-no-shell-escape`,
  `-synctex=1`, and `.texpulse/build`.
- Canonicalize project/root paths and reject lexical or linked build-directory
  escapes.
- Report readiness only after a real isolated compile succeeds or the user
  explicitly supplies `--skip-self-test`.
- Keep deterministic automation independent of MiKTeX by using a Node-based fake
  executable.

## 5. Commands run

```text
winget install --id StrawberryPerl.StrawberryPerl --exact
pnpm install
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
pnpm texpulse-doctor -- --help
pnpm texpulse-compile -- --help
node dist/cli/doctor.js --custom-bin C:\Strawberry\perl\bin
node dist/cli/compile.js --project fixtures\minimal-success --root main.tex --custom-bin C:\Strawberry\perl\bin
pdfinfo fixtures\minimal-success\.texpulse\build\main.pdf
pdftotext fixtures\minimal-success\.texpulse\build\main.pdf -
pdftoppm -png -f 1 -singlefile -r 144 ...
git diff --check
```

## 6. Test results and counts

- Unit test files: 9 passed.
- Unit tests: 39 passed.
- Integration test files: 2 passed.
- Integration tests: 6 passed.
- Coverage run: 11 files and 45 tests passed.
- Pure-module coverage: 97.72% statements, 94.73% branches, 100% functions, and
  97.64% lines.
- E2E: no applicable UI surface; status command passed.
- Formatting, linting, strict type checking, build, and aggregate gate: passed.
- Dependency audit: no known vulnerabilities.
- Clean-clone frozen install and complete gate: passed.
- Hosted GitHub Actions was not executed locally.

## 7. Real MiKTeX/PDF evidence

- Strawberry Perl `5.42.2.1` was installed through WinGet.
- MiKTeX `25.12`, `latexmk 4.88`, pdfLaTeX `4.23`, XeLaTeX `4.16`, LuaLaTeX
  `1.24.0`, BibTeX `4.2`, Biber `2.21`, and SyncTeX `1.21` were detected.
- The doctor was launched from `%TEMP%`, used
  `--custom-bin C:\Strawberry\perl\bin`, and passed its isolated real compile
  self-test.
- A clean compile of `fixtures/minimal-success/main.tex` succeeded in 768 ms.
- Generated artifacts: PDF 15,599 bytes, log 3,146 bytes, and SyncTeX 613 bytes.
- `pdfinfo` reported one unencrypted A4 page, PDF 1.5, produced by MiKTeX
  pdfTeX.
- Extracted text matched `TeXPulse Studio Sprint 1 compiler smoke test.`

## 8. Screenshot evidence

The generated PDF's first page was rendered to PNG and visually inspected. It
contains the expected sentence and page number with no visible corruption. There
is no application UI screenshot because Electron remains out of scope.

## 9. Security review findings

- No shell command strings or `shell: true` usage exists.
- Spaces and shell metacharacters survive as distinct process arguments.
- Shell escape and all automatic `.latexmkrc` loading are disabled.
- Root and build paths are constrained to the canonical project boundary,
  including a junction/link escape regression test.
- Missing engines, nonzero exits, missing PDFs, missing roots, and unusable
  `latexmk` are reported without claiming success.
- No critical or high dependency vulnerability remains.

## 10. Known limitations

- The compiler prototype accepts trusted local projects only.
- Timeout, cancellation, process-tree cleanup, one-active-build enforcement,
  generations, queue replacement, and stale-result rejection are Sprint 2.
- Compiler output is not yet bounded.
- MiKTeX reports that updates have not been checked.
- MakeIndex is runnable but does not expose a parseable version.
- pdfLaTeX received the real smoke test; XeLaTeX and LuaLaTeX recipe arrays are
  covered by deterministic tests but were not compiled in this sprint.
- A dedicated Unicode-path fixture is not yet present.
- Newly installed Codex PDF, CLI, and security skills were not active in this
  still-running session; PDF inspection used local MiKTeX tools and direct image
  review.

## 11. Technical debt

- Extend `CompilerAdapter` with cancellation in Sprint 2.
- Bound stdout/stderr and implement reliable Windows process-tree termination.
- Add build generations and prevent stale output from becoming current.
- Add dedicated Unicode and failure fixtures as their planned sprints begin.
- Revisit immutable GitHub Actions pins during security hardening.

## 12. Suggested commit message

```text
feat: add Sprint 1 toolchain doctor and compile CLI
```

## 13. Exact next sprint

Sprint 2: Build orchestration, cancellation, timeout, and generations. Do not
begin it without explicit approval.
