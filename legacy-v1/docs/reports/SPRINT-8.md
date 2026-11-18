# Sprint 8 Report

## 1. Sprint completed

Sprint 8: SyncTeX forward and inverse navigation completed on 2026-06-14. Sprint
9 work was not started.

## 2. Requirement IDs implemented

- `FR-SYNC-001` through `FR-SYNC-006`
- `FR-BUILD-007`, `FR-PDF-003`, and `FR-PDF-008`
- `NFR-COMP-003`, `NFR-REL-003`, and `NFR-REL-005`
- `NFR-SEC-004` through `NFR-SEC-006`, `NFR-SEC-008`, and partial `NFR-SEC-009`
- `NFR-MAINT-002` through `NFR-MAINT-005`
- `NFR-UX-001` through `NFR-UX-004` and `NFR-UX-006`
- `NFR-PRIV-001`, `NFR-PRIV-002`, and `AS-007`

## 3. Files changed

Sprint 8 adds or updates:

- strict forward/inverse SyncTeX IPC contracts and two preload methods;
- a bounded pure SyncTeX parser and timed shell-free process service;
- current-artifact, generated-path, and project-source validation in the
  main-process project session;
- PDF forward-target overlays and CodeMirror inverse-target decorations;
- multi-file native-format fixtures and a deterministic fake SyncTeX process;
- parser, reducer, component, process, session, IPC, and Electron E2E tests;
- ADR-0010 and architecture, security, testing, troubleshooting, contributor,
  status, traceability, and user documentation; and
- this sprint report.

No production dependency was added.

## 4. Design decisions

- Keep canonical paths, `.synctex.gz` files, process execution, and result
  parsing in the main process.
- Send only opaque build identity, relative source paths, and numeric
  coordinates through strict Zod contracts.
- Allow navigation only against the current visible successful artifact.
- Resolve inverse paths only when they match an enumerated project file.
- Invoke `synctex` with argument arrays, `shell: false`, the project working
  directory, and a five-second timeout.
- Remove `SYNCTEX_VIEWER` and `SYNCTEX_EDITOR` so queries cannot launch helpers.
- Parse at most 512 KiB and return generic non-path-leaking failure messages.
- Use a named Forward search button and PDF double-click for inverse search.

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
git diff --check
pnpm texpulse-compile -- --project fixtures\synctex-multifile --root main.tex --timeout 120000
synctex view -i 2:1:<included-source> -o <generated-pdf> -d <generation-directory>
synctex edit -o 1:<x>:<y>:<generated-pdf> -d <generation-directory>
pdfinfo <generated-main.pdf>
pdftotext <generated-main.pdf> -
pdftoppm -png -f 1 -singlefile -r 144 <generated-main.pdf> output\pdf\sprint-8-real
```

Focused Vitest, TypeScript, ESLint, build, and Playwright commands were also run
during implementation. The first expanded coverage run passed all tests but
reported 84.52% branches; explicit timeout, nonzero-exit, malformed-forward, and
malformed-inverse tests restored the unchanged 85% gate.

## 6. Test results and counts

- Unit test files: 21 passed.
- Unit tests: 106 passed.
- Component test files: 4 passed.
- Component tests: 8 passed.
- Integration test files: 11 passed.
- Integration tests: 42 passed.
- Coverage run: 36 files and 156 tests passed.
- Aggregate coverage: 93.25% statements, 85.12% branches, 94.68% functions, and
  93.30% lines.
- Electron E2E: 3 passed against the real Electron application process.
- Formatting, linting, strict type checking, production build, aggregate gate,
  diff whitespace check, and dependency audit: passed.

Coverage includes native-format parsing, malformed and oversized output,
negative columns, unknown paths, spaces in paths, exact argument arrays,
environment stripping, timeout and process failures, missing/stale data,
multi-file session mapping, visible targets, and both Electron directions.

## 7. Real MiKTeX/SyncTeX/PDF evidence

Real MiKTeX `latexmk` 4.88 compiled `fixtures/synctex-multifile` successfully in
1,162 ms with `-synctex=1`, `-no-shell-escape`, and a generation-isolated output
directory. It produced a 28,186-byte one-page A4 PDF and `main.synctex.gz`.

Native SyncTeX CLI 1.5 mapped `chapters/intro.tex`, line 2 to page 1 at
approximately `(156.52, 176.97)` points. Inverse search at that coordinate
returned the same included file and line with no column. The repository path
contains a space.

`pdfinfo` reported no JavaScript, forms, encryption, or suspect content.
`pdftotext` returned the main and included headings plus the expected navigation
sentence. The rendered page at `output/pdf/sprint-8-real.png` was visually
inspected and matched the fixture. MiKTeX still warns that updates have not been
checked.

## 8. Screenshot evidence

- `output/playwright/sprint-8-forward-search.png` shows the current PDF with a
  visible forward target.
- `output/playwright/sprint-8-inverse-search.png` shows `chapters/intro.tex:2`
  focused and marked after PDF inverse search.

Both screenshots were visually inspected. The controls, current-build state,
target indication, editor source, and non-fatal notice are legible.

## 9. Security review findings

- Electron sandboxing, context isolation, disabled Node integration, local CSP,
  permission denial, and popup/navigation denial remain unchanged.
- The bridge exposes exactly eleven fixed methods; no raw `ipcRenderer`,
  filesystem, or process primitive is exposed.
- Both requests and responses use strict schemas and trusted sender/frame
  checks.
- Forward paths pass through canonical project validation. Inverse paths become
  actionable only when they match an enumerated project-relative file.
- Artifact identity and generation paths are revalidated before every query.
- SyncTeX uses a direct executable plus argument array, `shell: false`, a
  five-second timeout, and the canonical project working directory.
- External SyncTeX helper environment variables are removed.
- Result parsing is bounded to 512 KiB and errors do not repeat child output or
  canonical paths.
- Stale or unavailable data leaves editor and PDF state intact.
- Source, PDF, SyncTeX data, and navigation remain local.
- `pnpm audit` reports no known vulnerabilities.

## 10. Known limitations

- Total child-process stdout/stderr capture remains unbounded until Sprint 10;
  the parser itself accepts at most 512 KiB.
- SyncTeX navigation is intentionally disabled for retained or edited-source
  PDFs until a current successful build exists.
- Inverse columns are often unavailable because MiKTeX returns `Column:-1`.
- Inverse paths use the project entry list captured when the project opens.
  Reopen after adding a source file.
- A PDF double-click is the current inverse-search gesture; configurable
  shortcuts are future settings work.
- The application remains limited to trusted local TeX projects until the Sprint
  10 threat model and hardening work are complete.

## 11. Technical debt

- Share known-project-file suffix resolution between diagnostics and SyncTeX.
- Refresh bounded project entries after safe watcher add/delete events.
- Add configurable SyncTeX gesture/key bindings during the settings sprint.
- Bound total process capture and generated artifacts during Sprint 10.

## 12. Suggested commit message

```text
feat: add Sprint 8 SyncTeX navigation
```

## 13. Exact next sprint

Sprint 9: Recipes, settings, setup wizard, and clean builds. Do not begin it
without explicit approval.
