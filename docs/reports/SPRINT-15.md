# Sprint 15 Report

## 1. Sprint completed

Sprint 15: Explorer and preview usability completed on 2026-06-14.

The sprint adds a denser material-inspired project explorer, scoped context
menus, validated copy/reveal operations, active standalone TeX compilation, and
a continuous multi-page PDF preview. Existing security, stale-result, retained
PDF, SyncTeX, and configured-root behavior remains in force.

## 2. Requirement IDs implemented

- `FR-PROJ-003` through `FR-PROJ-006`
- `FR-BUILD-001`, `FR-BUILD-005`, `FR-BUILD-007`, and `FR-BUILD-016`
- `FR-PDF-002`, `FR-PDF-003`, and `FR-PDF-008`
- `NFR-SEC-004` through `NFR-SEC-006`
- `NFR-PRIV-001` and `NFR-PRIV-002`
- `NFR-MAINT-005`
- `NFR-UX-001`, `NFR-UX-004`, and `NFR-UX-005`

## 3. Files changed

Sprint 15 updates:

- the project explorer, application orchestration, PDF viewer, and renderer
  styles under `src/renderer/`;
- project copy and entry-resolution behavior in
  `src/project/project-service.ts`;
- strict copy/reveal contracts, channels, session methods, IPC handlers, and
  preload methods under `src/ipc/` and `src/electron/`;
- focused unit, component, integration, Electron E2E, and packaged bridge tests
  under `tests/`;
- architecture, security, test, status, traceability, contributor, and README
  documentation; and
- this sprint report.

No production dependency was added.

## 4. Design decisions

- Use small inline SVG icons inspired by material file themes rather than add an
  icon dependency.
- Keep only New File and New Folder in the explorer header.
- Scope open, reveal, cut, copy, paste, rename, delete, and export actions to
  file, folder, or project-background context menus.
- Keep the clipboard inside the renderer and execute copy/move through existing
  typed project mutation boundaries.
- Resolve desktop reveal paths only in the main process after canonical project
  and link checks.
- Compile the active `.tex` file only when root detection identifies it as a
  standalone document; otherwise preserve the configured project root.
- Render all PDF pages in one vertical viewport while retaining Previous/Next as
  navigation shortcuts.

## 5. Commands run

```text
pnpm format
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:component
pnpm test:integration
pnpm test:performance
pnpm test:coverage
pnpm test:e2e
pnpm build
pnpm check
pnpm audit:dependencies
pnpm test:packaged
pnpm texpulse-compile -- --project <sprint-15-fixture> --root appendix.tex --timeout 120000
pdfinfo <appendix.pdf>
pdftotext <appendix.pdf> <appendix.txt>
pdftoppm -png -r 110 <appendix.pdf> <render-prefix>
git diff --check
```

## 6. Test results and counts

- Unit: 30 files and 140 tests passed.
- Component: 7 files and 20 tests passed.
- Deterministic integration: 17 files passed, 1 conditional file skipped, 87
  tests passed, and 7 native tests skipped.
- Performance: 1 file and 3 tests passed.
- Coverage: 54 files passed, 1 conditional file skipped, 247 tests passed, and 7
  native tests skipped.
- Coverage totals: 93.61% statements, 85.28% branches, 95.46% functions, and
  93.63% lines.
- Development Electron E2E: 8 tests passed.
- Installed release-candidate E2E: 2 tests passed.
- Formatting, linting, strict type checking, production build, aggregate check,
  NSIS packaging, install/reopen/uninstall lifecycle, and dependency audit:
  passed.

## 7. Real MiKTeX/PDF evidence

The native `texpulse-compile` CLI compiled the standalone active-root fixture
`appendix.tex` with MiKTeX `latexmk` 4.88 and pdfTeX 1.40.28.

- Status: succeeded
- Duration: 1,469 ms
- Pages: 3
- PDF size: 66,126 bytes
- SyncTeX: generated
- Shell escape: disabled
- `latexmk` configuration: disabled with `-norc`

`pdfinfo` confirmed a three-page letter-size PDF produced by MiKTeX. All three
pages were rendered to PNG and visually inspected. The expected page-one,
page-two, and page-three content is present without clipping or corruption.
MiKTeX still reports that updates have not yet been checked.

## 8. Screenshot evidence

- Explorer icons and file context menu:
  `output/playwright/sprint-15-project-context-menu.png`
- Native PDF page renders:
  `output/pdf/sprint-15-active-root/rendered/appendix-page-1.png` through
  `appendix-page-3.png`

## 9. Security review findings

- The complete implementation keeps Electron sandboxing, context isolation,
  disabled Node integration, CSP, and trusted sender/frame validation.
- The frozen preload bridge grows from 32 to 34 methods only for project copy
  and reveal.
- The renderer receives no absolute project path or raw shell primitive.
- Recursive copy rejects links, path escapes, copying into self, and partial
  destination residue after failure.
- Reveal revalidates the relative entry and type immediately before the main
  process invokes Electron's shell API.
- Active-root selection does not bypass root detection, compiler argument
  arrays, shell-escape denial, timeout, cancellation, generation isolation, or
  stale-result controls.

No unresolved Sprint 15 blocker remains.

## 10. Known limitations

- The continuous viewer currently renders every page instead of virtualizing or
  lazily mounting pages, so unusually large PDFs may use more memory.
- Recursive project copies do not yet expose progress or cancellation.
- Material-inspired icons are an application-owned subset, not the complete
  third-party Material Icon Theme catalog.
- Broader release-candidate limitations in `docs/SPRINT_STATUS.md` still apply.

## 11. Technical debt

- Add viewport virtualization or bounded lazy page mounting if large-document
  profiling shows meaningful PDF memory or latency pressure.
- Add progress and cancellation only if large recursive project copies become a
  demonstrated workflow need.

## 12. Suggested commit message

```text
feat: improve explorer and continuous PDF preview
```

## 13. Exact next sprint

No Sprint 16 is defined in `docs/SRS.md`. Stop after this report and wait for
explicit product direction.
