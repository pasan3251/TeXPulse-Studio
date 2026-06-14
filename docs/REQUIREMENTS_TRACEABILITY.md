# Requirements Traceability

## Sprint 0

| Requirement      | Sprint 0 evidence                                            | Status                   |
| ---------------- | ------------------------------------------------------------ | ------------------------ |
| SRS §16 Sprint 0 | Workspace, CI, docs, tests, frozen install, clean clone      | Complete                 |
| `NFR-MAINT-001`  | `tsconfig.json` strict controls and strict-failure unit test | Complete                 |
| `NFR-MAINT-004`  | ADR template plus ADR-0001 and ADR-0002                      | Complete for Sprint 0    |
| `NFR-MAINT-005`  | Five deterministic Vitest tests without arbitrary sleeps     | Complete for Sprint 0    |
| `NFR-MAINT-006`  | `AGENTS.md` contains verified current commands               | Complete                 |
| `NFR-COMP-001`   | Native Windows environment ADR and `windows-latest` CI       | Baseline complete        |
| `NFR-SEC-012`    | Frozen lockfile, restricted lifecycle scripts, clean audit   | Partial, release ongoing |
| `FR-PACK-006`    | Initial user, contributor, architecture, test, security docs | Partial, product ongoing |
| SRS §14.4        | Every current quality-gate command executes successfully     | Complete for Sprint 0    |
| SRS §20          | All required repository documents and ADRs exist             | Complete                 |

## Scope boundary

At the Sprint 0 baseline, compiler, project, Electron, editor, PDF, diagnostics,
SyncTeX, recovery, settings, packaging, and collaboration requirements were not
started. The sprint tables below record subsequent progress; remaining planned
sprint assignments are authoritative in `docs/SRS.md`.

## Evidence

- Sprint report: `reports/SPRINT-0.md`
- Unit tests: `tests/unit/`
- CI workflow: `.github/workflows/ci.yml`
- Dependency lock: `pnpm-lock.yaml`

## Sprint 1

| Requirement     | Sprint 1 evidence                                           | Status                  |
| --------------- | ----------------------------------------------------------- | ----------------------- |
| `FR-ENV-001`    | `latexmk` discovery and usability probe                     | Complete                |
| `FR-ENV-002`    | pdfLaTeX, XeLaTeX, and LuaLaTeX independent probes          | Complete                |
| `FR-ENV-003`    | BibTeX, Biber, MakeIndex, and SyncTeX independent probes    | Complete                |
| `FR-ENV-004`    | Structured tool paths, versions, state, and detail          | Complete                |
| `FR-ENV-005`    | `--custom-bin` discovery and child PATH propagation         | CLI foundation complete |
| `FR-ENV-006`    | Isolated temporary real compile self-test                   | Complete                |
| `FR-ENV-007`    | Missing/unusable tool messages, including missing Perl      | Complete                |
| `FR-ENV-008`    | Doctor readiness requires passed or explicitly skipped test | Complete                |
| `FR-BUILD-010`  | Structured executable, output, exit, and timing result      | Prototype complete      |
| `FR-BUILD-011`  | Shell-free executable plus argument-array process runner    | Complete                |
| `FR-BUILD-012`  | Canonical project/root validation and project working dir   | Prototype complete      |
| `FR-BUILD-013`  | Default `.texpulse/build` output separation                 | Complete                |
| `FR-BUILD-014`  | pdfLaTeX, XeLaTeX, and LuaLaTeX `latexmk` recipes           | Prototype complete      |
| `FR-SYNC-001`   | Compile arguments request SyncTeX output                    | Complete                |
| `NFR-SEC-006`   | Root and build boundary checks, including link escape       | Prototype complete      |
| `NFR-SEC-007`   | Explicit `-no-shell-escape`                                 | Complete                |
| `NFR-COMP-001`  | Native Windows development and real smoke-test evidence     | Current scope complete  |
| `NFR-COMP-002`  | MiKTeX-specific implementation behind compiler adapter      | Current scope complete  |
| `NFR-COMP-003`  | Spaces-in-path unit and integration coverage                | Partial; Unicode later  |
| `NFR-COMP-004`  | MiKTeX behavior isolated behind `MiktexCompilerAdapter`     | Current scope complete  |
| `NFR-MAINT-002` | Typed compiler, process, probe, and result contracts        | Current scope complete  |
| `NFR-MAINT-003` | Independent compiler, process, toolchain, and CLI modules   | Current scope complete  |
| `NFR-MAINT-005` | Deterministic tests without arbitrary sleeps                | Complete                |
| `AS-005`        | Missing and unusable toolchain behavior tested              | CLI complete            |

### Sprint 1 evidence

- Sprint report: `reports/SPRINT-1.md`
- Compiler fixture: `../fixtures/minimal-success/main.tex`
- Unit and integration tests: `../tests/`
- Safety decision: `adr/ADR-0003-compiler-prototype-safety.md`

## Sprint 2

| Requirement    | Sprint 2 evidence                                        | Status                 |
| -------------- | -------------------------------------------------------- | ---------------------- |
| `FR-BUILD-002` | Controller accepts fake-timer debounce requests          | Foundation; UI later   |
| `FR-BUILD-003` | 800 ms debounce verified with fake timers                | Foundation; UI later   |
| `FR-BUILD-004` | One active compile per project controller                | Complete               |
| `FR-BUILD-005` | One newest pending request replaces intermediates        | Complete               |
| `FR-BUILD-006` | UUID build IDs and monotonic generations                 | Complete               |
| `FR-BUILD-007` | Stale result disposition cannot update current state     | Complete               |
| `FR-BUILD-008` | Adapter cancellation and CLI `Ctrl+C`                    | Service complete       |
| `FR-BUILD-009` | Configurable timeout with process-tree cleanup           | Complete               |
| `FR-BUILD-010` | Structured timing, process output, exit, and status      | Complete               |
| `FR-BUILD-016` | Generation isolation and retained successful metadata    | Service complete       |
| `FR-BUILD-017` | `VisiblePdf.isCurrent` distinguishes retained output     | Service complete       |
| `NFR-PERF-003` | 50-request stress test runs active plus newest only      | Complete               |
| `NFR-REL-001`  | Failed generation cannot overwrite successful generation | Service complete       |
| `NFR-REL-002`  | Stale success is rejected from last-successful state     | Complete               |
| `NFR-REL-003`  | Exit, missing output, timeout, cancellation survive      | Current scope complete |
| `NFR-REL-005`  | Deterministic state-machine and fake-timer tests         | Complete               |
| `NFR-SEC-008`  | Default and configurable enforced compiler timeout       | Complete               |
| `AS-003`       | Rapid requests collapse and stale output is rejected     | Service complete       |
| `AS-004`       | Cancellation terminates fake parent and descendant       | Service/CLI complete   |

### Sprint 2 evidence

- Sprint report: `reports/SPRINT-2.md`
- Build controller tests: `../tests/unit/build-controller.test.ts`
- Process cleanup tests: `../tests/integration/process-cleanup.test.ts`
- Timeout fixture: `../fixtures/timeout/main.tex`
- Orchestration decision:
  `adr/ADR-0004-build-orchestration-and-process-cleanup.md`

## Sprint 3

| Requirement     | Sprint 3 evidence                                            | Status                   |
| --------------- | ------------------------------------------------------------ | ------------------------ |
| `FR-PROJ-001`   | Canonical existing-directory open in `ProjectService`        | Service complete         |
| `FR-PROJ-003`   | Typed deterministic entry enumeration for future tree        | Foundation; UI later     |
| `FR-PROJ-004`   | File/folder create, rename, move, and delete service         | Service complete         |
| `FR-PROJ-005`   | Deterministic scoring of likely LaTeX root files             | Complete                 |
| `FR-PROJ-006`   | Validated `rootFile` project metadata override               | Service complete         |
| `FR-PROJ-007`   | Bounded, deduplicated recent-project persistence             | Service complete         |
| `FR-PROJ-008`   | Content-version check reports changed or deleted files       | Service complete         |
| `FR-PROJ-009`   | Internal links/junctions listed but never traversed          | Complete                 |
| `FR-PROJ-010`   | Unicode and spaces covered through full CRUD lifecycle       | Complete                 |
| `FR-PROJ-011`   | Stale writes fail with conflict and preserve external data   | Service complete         |
| `FR-SAVE-002`   | Same-directory temporary file, sync, and atomic replacement  | Complete where practical |
| `FR-SAVE-003`   | Typed failures prevent callers treating save as successful   | Service foundation       |
| `FR-SAVE-004`   | Explicit current, changed, and deleted file states           | Service complete         |
| `FR-SAVE-005`   | Required version token rejects external overwrite            | Service complete         |
| `FR-SET-002`    | Project metadata separate in `.texpulse/project.json`        | Service complete         |
| `FR-SET-003`    | Root, recipe, auto-build, and build-directory fields         | Partial; later settings  |
| `FR-SET-004`    | Schema-version and field validation                          | Service complete         |
| `FR-SET-005`    | Invalid/outdated data returns defaults plus issue messages   | Service complete         |
| `NFR-PERF-005`  | Async deterministic enumeration without renderer blocking    | Foundation; UI later     |
| `NFR-PERF-006`  | Default and configured generated folders are not traversed   | Complete                 |
| `NFR-REL-004`   | Atomic replacement minimizes partial-file corruption         | Complete where practical |
| `NFR-SEC-006`   | Canonical root, relative paths, realpath, and link rejection | Current scope complete   |
| `NFR-COMP-003`  | Windows Unicode and spaces integration test                  | Current scope complete   |
| `NFR-MAINT-003` | Independent path, metadata, persistence, and root modules    | Current scope complete   |
| `AS-009`        | Traversal and internal-link requests rejected before access  | Service complete         |

### Sprint 3 evidence

- Sprint report: `reports/SPRINT-3.md`
- Project service: `../src/project/`
- Unit and integration tests: `../tests/unit/` and `../tests/integration/`
- Filesystem decision: `adr/ADR-0005-project-filesystem-boundary.md`

## Sprint 4

| Requirement     | Sprint 4 evidence                                            | Status                       |
| --------------- | ------------------------------------------------------------ | ---------------------------- |
| `FR-PROJ-001`   | Folder chooser opens one bounded `ProjectService` session    | UI complete                  |
| `FR-PROJ-003`   | Flat entries render as a deterministic hierarchical tree     | Complete                     |
| `FR-EDIT-001`   | Valid UTF-8 project text opens in CodeMirror                 | Current scope complete       |
| `FR-EDIT-002`   | CodeMirror `stex` language mode highlights LaTeX             | Complete                     |
| `FR-EDIT-003`   | CodeMirror basic setup supplies undo and redo                | Complete                     |
| `FR-EDIT-004`   | CodeMirror basic setup supplies find and replace             | Complete                     |
| `FR-EDIT-005`   | Tree, tab, and status bar expose modified state              | Complete                     |
| `FR-EDIT-006`   | Toolbar saves the active file or all modified files          | Complete                     |
| `FR-EDIT-007`   | Reducer and E2E QA preserve cursor and scroll per file       | Complete                     |
| `FR-EDIT-009`   | Word wrapping enabled; font-size configuration remains later | Partial                      |
| `FR-EDIT-010`   | Editing remains independent while async saves are pending    | Foundation; build UI later   |
| `FR-SAVE-003`   | Save failures are visible and remain dirty                   | UI scope complete            |
| `FR-SAVE-005`   | Version conflict preserves local buffer and external file    | UI scope complete            |
| `NFR-PERF-001`  | CodeMirror edits update local state without waiting for I/O  | Current scope complete       |
| `NFR-PERF-002`  | No blocking I/O in input path; measured benchmark remains    | Foundation                   |
| `NFR-PERF-005`  | Async enumeration plus memoized hierarchy construction       | Foundation; scale test later |
| `NFR-SEC-001`   | Electron checklist controls recorded in ADR-0006             | Current scope complete       |
| `NFR-SEC-002`   | BrowserWindow and E2E assert no renderer Node integration    | Complete                     |
| `NFR-SEC-003`   | BrowserWindow enables context isolation                      | Complete                     |
| `NFR-SEC-004`   | Frozen preload exposes exactly three project methods         | Complete                     |
| `NFR-SEC-005`   | Strict request/response schemas and sender/frame checks      | Complete                     |
| `NFR-SEC-006`   | IPC delegates all paths to canonical `ProjectService` checks | Current scope complete       |
| `NFR-SEC-010`   | External navigation and new windows are denied               | Current scope complete       |
| `NFR-SEC-011`   | Local-only renderer CSP disallows scripts/eval/network       | Complete                     |
| `NFR-PRIV-001`  | Project source remains local                                 | Complete for Sprint 4        |
| `NFR-PRIV-002`  | No analytics or telemetry added                              | Complete for Sprint 4        |
| `NFR-MAINT-002` | Typed renderer, preload, IPC, and result contracts           | Current scope complete       |
| `NFR-MAINT-003` | Electron, IPC, renderer state, and tree modules are separate | Current scope complete       |
| `NFR-MAINT-004` | ADR-0006 records the Electron security boundary              | Complete for Sprint 4        |
| `NFR-MAINT-005` | Reducer, component, IPC, and E2E tests use controlled inputs | Complete for Sprint 4        |
| `NFR-UX-001`    | Core toolbar, tree, and editor actions are keyboard usable   | Current scope complete       |
| `NFR-UX-003`    | Native control order and editor focus provide logical flow   | Current scope complete       |
| `NFR-UX-004`    | Controls, tree, editor, status, and dismiss action are named | Current scope complete       |
| `AS-009`        | Traversal IPC returns `path-escape` and logs a warning       | Complete                     |

### Sprint 4 evidence

- Sprint report: `reports/SPRINT-4.md`
- Electron and preload: `../src/electron/`
- Typed IPC contracts: `../src/ipc/`
- Renderer and editor: `../src/renderer/`
- Unit, component, integration, and E2E tests: `../tests/`
- Security decision: `adr/ADR-0006-secure-electron-shell-and-ipc.md`

## Sprint 5

| Requirement    | Sprint 5 evidence                                               | Status                 |
| -------------- | --------------------------------------------------------------- | ---------------------- |
| `FR-EDIT-010`  | CodeMirror remains editable while compile IPC is pending        | Current scope complete |
| `FR-SAVE-003`  | Failed or raced save stops compile with a visible message       | Complete               |
| `FR-BUILD-001` | Compile action saves modified buffers then requests a build     | Complete               |
| `FR-BUILD-004` | One session-owned `BuildController` per open project            | Complete               |
| `FR-BUILD-005` | Existing newest-only controller remains the UI authority        | Complete               |
| `FR-BUILD-006` | Opaque build ID and generation cross strict IPC                 | Complete               |
| `FR-BUILD-007` | Controller and renderer reducer reject stale generations        | Complete               |
| `FR-BUILD-008` | Cancel action reaches the active adapter build                  | Complete               |
| `FR-BUILD-009` | Existing enforced 120-second timeout remains active             | Complete               |
| `FR-BUILD-010` | Status, duration, failure, stdout/stderr, and raw log surfaced  | Current UI scope       |
| `FR-BUILD-011` | UI uses the existing shell-free compiler adapter                | Complete               |
| `FR-BUILD-012` | Session delegates root and working-directory validation         | Complete               |
| `FR-BUILD-013` | Generation-isolated `.texpulse/build` output remains default    | Complete               |
| `FR-BUILD-016` | Integration and E2E retain the previous PDF after failure       | Complete               |
| `FR-BUILD-017` | Current and last-successful badges are explicit                 | Complete               |
| `FR-PDF-001`   | Completed bytes render through lazy PDF.js                      | Complete               |
| `FR-PDF-002`   | Page, scroll, zoom, fit-width, and fit-page controls            | Complete               |
| `FR-PDF-003`   | Component test preserves page, zoom, and scroll on reload       | Complete               |
| `FR-PDF-004`   | PDF loading starts only after build completion                  | Complete               |
| `FR-PDF-005`   | Isolated output and readable-file checks avoid partial loads    | Current scope complete |
| `FR-PDF-006`   | Revalidated artifact opens through `shell.openPath`             | Complete               |
| `FR-PDF-007`   | Revalidated artifact reveals through Explorer                   | Complete               |
| `FR-PDF-008`   | Stale identity and stale reducer tests reject replacement       | Complete               |
| `FR-DIAG-001`  | Complete log remains on disk; bounded raw display is available  | Complete               |
| `FR-DIAG-006`  | Raw log remains independent of later parser work                | Complete               |
| `NFR-PERF-001` | Build work remains asynchronous from CodeMirror input           | Current scope complete |
| `NFR-PERF-007` | Canvas remains while replacement loads; state is restored       | Current scope complete |
| `NFR-REL-001`  | Failed build cannot delete or replace the retained PDF          | Complete               |
| `NFR-REL-002`  | Stale builds and artifact tokens cannot become current          | Complete               |
| `NFR-REL-003`  | Failure, cancellation, timeout, and missing output remain typed | Current scope complete |
| `NFR-SEC-004`  | Frozen bridge exposes eight fixed methods                       | Current scope complete |
| `NFR-SEC-005`  | Strict schemas cover every new request and response             | Complete               |
| `NFR-SEC-006`  | Artifact paths are canonicalized below generation output        | Current scope complete |
| `NFR-SEC-007`  | Existing `-no-shell-escape` remains active                      | Complete               |
| `NFR-SEC-008`  | Existing timeout and cancellation remain active                 | Complete               |
| `NFR-SEC-009`  | PDF and renderer log copies are bounded                         | Partial; output later  |
| `NFR-SEC-011`  | CSP permits only the local PDF.js worker                        | Current scope complete |
| `NFR-PRIV-001` | Source and generated PDF remain local                           | Complete for Sprint 5  |
| `NFR-PRIV-002` | No analytics or telemetry added                                 | Complete for Sprint 5  |
| `AS-001`       | Electron edit/save/compile/PDF workflow                         | UI complete            |
| `AS-002`       | Failed build keeps prior preview and exposes failure log        | Complete               |

### Sprint 5 evidence

- Sprint report: `reports/SPRINT-5.md`
- Build/PDF session and IPC: `../src/electron/` and `../src/ipc/`
- PDF.js viewer and workspace state: `../src/renderer/`
- Unit, component, integration, and Electron E2E tests: `../tests/`
- PDF/artifact decision: `adr/ADR-0007-pdf-preview-and-artifact-boundary.md`

## Sprint 6

| Requirement    | Sprint 6 evidence                                                 | Status                    |
| -------------- | ----------------------------------------------------------------- | ------------------------- |
| `FR-EDIT-007`  | Open files, active file, cursor, scroll, and pane ratio restore   | Complete                  |
| `FR-EDIT-010`  | Editing remains responsive during save and delayed compilation    | Complete                  |
| `FR-SAVE-001`  | Configurable autosave follows each debounced editing burst        | Complete                  |
| `FR-SAVE-002`  | Autosave retains the atomic versioned project write service       | Complete                  |
| `FR-SAVE-003`  | Autosave failures remain dirty and produce visible notices        | Complete                  |
| `FR-SAVE-004`  | Watcher and version tokens distinguish external file changes      | Complete                  |
| `FR-SAVE-005`  | Conflict E2E preserves both unsaved and externally written text   | Complete                  |
| `FR-SAVE-006`  | Internal write versions suppress self-generated watcher events    | Complete                  |
| `FR-BUILD-002` | Source edits schedule automatic compilation when enabled          | Complete                  |
| `FR-BUILD-003` | 800 ms default and bounded selectable debounce are verified       | Complete                  |
| `FR-BUILD-004` | E2E trace proves no overlapping compiler processes                | Complete                  |
| `FR-BUILD-005` | Rapid edits retain only the newest pending request                | Complete                  |
| `FR-BUILD-006` | Existing build IDs and monotonic generations remain authoritative | Complete                  |
| `FR-BUILD-007` | Main disposition plus renderer revision reject stale results      | Complete                  |
| `FR-BUILD-016` | Live failures and edits retain the last successful PDF            | Complete                  |
| `FR-BUILD-017` | Current/retained PDF identity follows the accepted source state   | Complete                  |
| `FR-PDF-008`   | Revision is rechecked after asynchronous PDF byte loading         | Complete                  |
| `FR-SET-003`   | Autosave, auto-build, and debounce persist per opaque project ID  | Partial; full UI Sprint 9 |
| `NFR-PERF-001` | CodeMirror input remains independent of saves and builds          | Complete                  |
| `NFR-PERF-002` | Delayed-build E2E edits remain responsive                         | Current scope complete    |
| `NFR-PERF-003` | Rapid edits coalesce while one active build remains the maximum   | Complete                  |
| `NFR-PERF-004` | Default debounce plus real compile measured below three seconds   | Complete for fixture      |
| `NFR-PERF-006` | Watcher excludes generated, dependency, and metadata directories  | Complete                  |
| `NFR-REL-001`  | Failed or stale live builds cannot replace retained output        | Complete                  |
| `NFR-REL-002`  | Changed renderer revisions reject otherwise-current results       | Complete                  |
| `NFR-REL-003`  | Save/build failures and cancellation remain recoverable           | Current scope complete    |
| `NFR-REL-004`  | Serialized autosaves retain atomic replacement behavior           | Complete where practical  |
| `NFR-REL-005`  | Coordinator and watcher state tests use controlled timing         | Complete                  |
| `NFR-SEC-004`  | Frozen bridge exposes nine fixed methods                          | Current scope complete    |
| `NFR-SEC-005`  | Watch events validate project ID, path, and event kind            | Complete                  |
| `NFR-SEC-006`  | Main watcher retains canonical root and non-traversable links     | Current scope complete    |
| `NFR-PRIV-001` | Source, PDF, build data, and watcher events remain local          | Complete for Sprint 6     |
| `NFR-PRIV-002` | No analytics, telemetry, or network persistence added             | Complete for Sprint 6     |
| `AS-001`       | Edit, autosave, live compile, and current PDF E2E workflow        | Complete                  |
| `AS-003`       | Rapid typing, queued handoff, and newest-result acceptance E2E    | Complete                  |

### Sprint 6 evidence

- Sprint report: `reports/SPRINT-6.md`
- Live-build coordinator and persistence: `../src/renderer/`
- Project watcher and session integration: `../src/project/` and
  `../src/electron/`
- Unit, integration, component, and Electron E2E tests: `../tests/`
- Design decision: `adr/ADR-0008-live-build-and-project-watching.md`

## Sprint 7

| Requirement     | Sprint 7 evidence                                                   | Status                 |
| --------------- | ------------------------------------------------------------------- | ---------------------- |
| `FR-EDIT-008`   | CodeMirror line decorations mark error, warning, and info lines     | Complete               |
| `FR-BUILD-007`  | Reducer rejects older generations before replacing diagnostics      | Complete               |
| `FR-BUILD-020`  | Missing file/package output explains MiKTeX install/path actions    | Complete               |
| `FR-DIAG-001`   | Full compiler log remains on disk; bounded raw panel remains        | Complete               |
| `FR-DIAG-002`   | Pure parser handles common LaTeX and bibliography output            | Complete               |
| `FR-DIAG-003`   | Typed severity, message, file, line, column, source, and excerpt    | Complete               |
| `FR-DIAG-004`   | Problem selection opens the validated project file and source line  | Complete               |
| `FR-DIAG-005`   | Required error, warning, bibliography, timeout, and cancel cases    | Complete               |
| `FR-DIAG-006`   | Unknown/malformed output falls back while raw log remains visible   | Complete               |
| `FR-DIAG-007`   | Main generation and renderer revision checks reject stale results   | Complete               |
| `FR-DIAG-008`   | Problems UI uses visible Error, Warning, and Info text labels       | Complete               |
| `NFR-REL-003`   | Malformed logs and status-only timeout/cancel paths are recoverable | Current scope complete |
| `NFR-REL-005`   | Parser and reducer behavior is deterministic and unit tested        | Complete               |
| `NFR-SEC-009`   | Display log, diagnostic count, messages, and excerpts are bounded   | Partial; capture later |
| `NFR-MAINT-002` | Strict Zod IPC and TypeScript diagnostic contracts                  | Current scope complete |
| `NFR-MAINT-003` | Diagnostics live in an independent pure module                      | Current scope complete |
| `NFR-MAINT-005` | Parser, component, integration, and E2E tests avoid sleeps          | Complete               |
| `NFR-UX-001`    | Problems and source navigation are keyboard-operable buttons        | Current scope complete |
| `NFR-UX-002`    | Severity and retained/current build states use text, not color only | Complete               |
| `NFR-UX-003`    | Selecting a problem moves focus into the target editor              | Complete               |
| `NFR-UX-004`    | Problems region, controls, and each located problem are named       | Complete               |
| `NFR-UX-006`    | Missing-package and fallback messages provide next actions          | Current scope complete |
| `NFR-PRIV-001`  | Diagnostic parsing and display remain entirely local                | Complete for Sprint 7  |
| `NFR-PRIV-002`  | No analytics, telemetry, or network service was added               | Complete for Sprint 7  |
| `AS-002`        | E2E retains and labels the previous PDF and links the new error     | Complete               |
| `AS-006`        | Session integration maps included-file errors to path and line      | Complete               |

### Sprint 7 evidence

- Sprint report: `reports/SPRINT-7.md`
- Parser and typed model: `../src/diagnostics/` and
  `../src/ipc/build-contracts.ts`
- Problems panel, editor markers, and reducer: `../src/renderer/`
- Golden fixtures: `../fixtures/syntax-error/`,
  `../fixtures/undefined-reference/`, `../fixtures/missing-package/`,
  `../fixtures/bibliography-bibtex/`, `../fixtures/bibliography-biber/`,
  `../fixtures/multi-file/`, and `../fixtures/malformed-log/`
- Unit, component, integration, Electron E2E, and real MiKTeX evidence:
  `../tests/`
- Design decision: `adr/ADR-0009-structured-diagnostics.md`

## Sprint 8

| Requirement     | Sprint 8 evidence                                                    | Status                 |
| --------------- | -------------------------------------------------------------------- | ---------------------- |
| `FR-SYNC-001`   | Existing `latexmk` arguments continue to request `-synctex=1`        | Complete               |
| `FR-SYNC-002`   | Current source position maps to a marked PDF page location           | Complete               |
| `FR-SYNC-003`   | PDF double-click maps to a validated source file and line            | Complete               |
| `FR-SYNC-004`   | Canonical paths, argument arrays, shell-off spawn, and timeout       | Complete               |
| `FR-SYNC-005`   | Missing, malformed, failed, and stale data return visible notices    | Complete               |
| `FR-SYNC-006`   | Fixture, session, E2E, and native multi-file round trips             | Complete               |
| `FR-BUILD-007`  | Only the current visible successful generation may be queried        | Complete               |
| `FR-PDF-003`    | Forward target changes page without replacing viewer state           | Current scope complete |
| `FR-PDF-008`    | Opaque build identity is revalidated before every SyncTeX query      | Complete               |
| `NFR-COMP-003`  | Argument and native tests run from Windows paths containing spaces   | Current scope complete |
| `NFR-REL-003`   | Navigation failures are typed, non-destructive, and recoverable      | Complete               |
| `NFR-REL-005`   | Parser, process, session, component, and E2E tests are deterministic | Complete               |
| `NFR-SEC-004`   | Frozen preload exposes eleven fixed methods                          | Current scope complete |
| `NFR-SEC-005`   | Strict request and response schemas cover both directions            | Complete               |
| `NFR-SEC-006`   | Forward and inverse paths remain inside the canonical project        | Complete               |
| `NFR-SEC-008`   | SyncTeX queries use a five-second process timeout                    | Current scope complete |
| `NFR-SEC-009`   | Parsed SyncTeX output is bounded to 512 KiB                          | Partial; capture later |
| `NFR-MAINT-002` | Typed contracts cover service, IPC, renderer, and targets            | Complete               |
| `NFR-MAINT-003` | SyncTeX parsing and execution are independent modules                | Complete               |
| `NFR-MAINT-004` | ADR-0010 records the SyncTeX boundary                                | Complete               |
| `NFR-MAINT-005` | Focused tests use fixtures, fake runners, and controlled processes   | Complete               |
| `NFR-UX-001`    | Forward search is a keyboard-operable named button                   | Current scope complete |
| `NFR-UX-002`    | Source and PDF targets use shape/border as well as color             | Complete               |
| `NFR-UX-003`    | Inverse search moves focus to the target editor                      | Complete               |
| `NFR-UX-004`    | Forward target and navigation controls have accessible names         | Complete               |
| `NFR-UX-006`    | Stale and unavailable messages state the corrective action           | Complete               |
| `NFR-PRIV-001`  | Source, PDF, and SyncTeX processing remain local                     | Complete for Sprint 8  |
| `NFR-PRIV-002`  | No analytics, telemetry, or network service was added                | Complete for Sprint 8  |
| `AS-007`        | Electron and native evidence complete both navigation directions     | Complete               |

### Sprint 8 evidence

- Sprint report: `reports/SPRINT-8.md`
- Parser and process service: `../src/synctex/`
- Strict contracts and main-process session/IPC: `../src/ipc/` and
  `../src/electron/`
- PDF and editor target UI: `../src/renderer/`
- Multi-file fixture: `../fixtures/synctex-multifile/`
- Unit, component, integration, Electron E2E, and native MiKTeX evidence:
  `../tests/`
- Design decision: `adr/ADR-0010-synctex-navigation-boundary.md`

## Sprint 9

| Requirement     | Sprint 9 evidence                                                   | Status                 |
| --------------- | ------------------------------------------------------------------- | ---------------------- |
| `FR-ENV-001`    | Settings wizard reports `latexmk` discovery                         | UI complete            |
| `FR-ENV-002`    | pdfLaTeX, XeLaTeX, and LuaLaTeX paths and versions are displayed    | UI complete            |
| `FR-ENV-003`    | BibTeX, Biber, MakeIndex, and SyncTeX remain independent results    | UI complete            |
| `FR-ENV-004`    | Toolchain results show executable paths, versions, and states       | Complete               |
| `FR-ENV-005`    | Global custom executable directory is persisted and applied         | Complete               |
| `FR-ENV-006`    | Wizard runs the isolated real doctor fixture                        | Complete               |
| `FR-ENV-007`    | Missing and unusable tools retain actionable doctor messages        | Complete               |
| `FR-ENV-008`    | Ready requires passed self-test; skip remains explicit              | Complete               |
| `FR-EDIT-009`   | Settings control editor font size; word wrapping remains enabled    | Complete               |
| `FR-SAVE-001`   | Global autosave is configurable and defaults to enabled             | Complete               |
| `FR-BUILD-009`  | Global timeout setting is validated and applied per request         | Complete               |
| `FR-BUILD-013`  | Project build directory is configurable with safe default           | Complete               |
| `FR-BUILD-014`  | Three `latexmk` recipes have unit, E2E, and native evidence         | Complete               |
| `FR-BUILD-015`  | Default `-norc`, explicit project trust, warning, and ADR           | Complete               |
| `FR-BUILD-018`  | Clean build uses `-gg` with normal build controls                   | Complete               |
| `FR-BUILD-019`  | Allowlisted generation cleanup preserves non-auxiliary output       | Complete               |
| `FR-PDF-002`    | Global default PDF zoom selects fit-width or fit-page               | Complete               |
| `FR-SET-001`    | Atomic global settings file lives under Electron `userData`         | Complete               |
| `FR-SET-002`    | Project settings remain in `.texpulse/project.json`                 | Complete               |
| `FR-SET-003`    | All listed global and project controls are exposed                  | Complete               |
| `FR-SET-004`    | Strict Zod/global and project metadata validation                   | Complete               |
| `FR-SET-005`    | Invalid data restores safe defaults with visible notices            | Complete               |
| `FR-SET-006`    | Global v0 and project v1 migrate to current schemas                 | Complete               |
| `FR-PACK-003`   | Incomplete first-launch state opens the toolchain setup wizard      | Complete               |
| `FR-PACK-004`   | Wizard separates app operation from real TeX readiness              | Complete               |
| `NFR-REL-003`   | Settings, readiness, cleanup, and build failures stay recoverable   | Current scope complete |
| `NFR-REL-005`   | Schemas, recipes, cleanup, and UI states have deterministic tests   | Complete               |
| `NFR-SEC-004`   | Frozen preload exposes seventeen fixed methods                      | Current scope complete |
| `NFR-SEC-005`   | Every new settings/build request and response is strictly validated | Complete               |
| `NFR-SEC-006`   | Build-directory changes and cleanup retain project boundaries       | Current scope complete |
| `NFR-SEC-007`   | Shell escape remains disabled for every recipe and trust mode       | Complete               |
| `NFR-SEC-008`   | Configurable timeout applies to normal and clean builds             | Complete               |
| `NFR-MAINT-002` | Typed settings, readiness, cleanup, IPC, and UI contracts           | Complete               |
| `NFR-MAINT-003` | Settings and cleanup are independent modules                        | Complete               |
| `NFR-MAINT-004` | ADR-0011 records persistence and trust boundaries                   | Complete               |
| `NFR-MAINT-005` | Unit, component, integration, E2E, and conditional native tests     | Complete               |
| `NFR-UX-001`    | Dialog controls and maintenance actions are keyboard operable       | Current scope complete |
| `NFR-UX-002`    | Readiness uses text states in addition to styling                   | Complete               |
| `NFR-UX-004`    | Settings, readiness, tools, and actions have accessible labels      | Complete               |
| `NFR-UX-006`    | Recovery and trust messages explain consequences and actions        | Current scope complete |
| `NFR-PRIV-001`  | Settings and toolchain checks remain local                          | Complete for Sprint 9  |
| `NFR-PRIV-002`  | No analytics, telemetry, or network service was added               | Complete for Sprint 9  |
| `AS-005`        | Setup component and IPC report missing readiness without crashing   | Complete               |

### Sprint 9 evidence

- Sprint report: `reports/SPRINT-9.md`
- Global/project settings and migrations: `../src/settings/` and
  `../src/project/project-metadata.ts`
- Settings/setup UI and typed IPC: `../src/renderer/`,
  `../src/ipc/settings-contracts.ts`, and `../src/electron/`
- Recipes, trust, clean builds, and cleanup: `../src/compiler/` and
  `../src/electron/project-session.ts`
- Unit, component, integration, Electron E2E, and conditional native tests:
  `../tests/`
- Design decision: `adr/ADR-0011-settings-toolchain-and-latexmk-trust.md`

## Sprint 10

| Requirement     | Sprint 10 evidence                                                                                                              | Status                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `FR-REC-001`    | Bounded dirty-buffer snapshots survive an abnormal Electron shutdown                                                            | Complete where feasible     |
| `FR-REC-002`    | Restore changes editor state only; E2E proves disk remains unchanged                                                            | Complete                    |
| `FR-REC-003`    | Recovery dialog requires explicit restore or discard                                                                            | Complete                    |
| `FR-REC-004`    | Process exits, output overflow, timeout, cancellation, and crashes remain typed and isolated                                    | Complete                    |
| `FR-REC-005`    | Existing retained-PDF behavior and rendering-failure tests remain green                                                         | Complete                    |
| `FR-REC-006`    | Rotating structured local application JSONL log                                                                                 | Complete                    |
| `FR-REC-007`    | Event fields exclude document content and bound all text values                                                                 | Complete                    |
| `FR-REC-008`    | Settings actions clear project recovery or all recovery/log data                                                                | Complete                    |
| `FR-DIAG-001`   | Full bounded generation log remains on disk; renderer copy remains 2 MiB                                                        | Complete                    |
| `FR-DIAG-006`   | Oversized or malformed log handling preserves bounded raw fallback                                                              | Complete                    |
| `NFR-REL-003`   | Output overflow, malformed recovery, log failure, and rendering failure are recoverable                                         | Current scope complete      |
| `NFR-REL-004`   | Recovery store uses atomic replacement; project writes retain version checks                                                    | Complete where practical    |
| `NFR-REL-005`   | Recovery, logging, output, navigation, and retention tests are deterministic                                                    | Complete                    |
| `NFR-SEC-001`   | Threat model and Electron security review match implementation                                                                  | Complete for Sprint 10      |
| `NFR-SEC-004`   | Frozen preload exposes twenty-two fixed methods                                                                                 | Current scope complete      |
| `NFR-SEC-005`   | Recovery/support requests and responses use strict schemas and sender checks                                                    | Complete                    |
| `NFR-SEC-006`   | Recovery paths and generated output retain canonical project boundaries                                                         | Current scope complete      |
| `NFR-SEC-007`   | Every recipe and trust mode retains `-no-shell-escape` tests                                                                    | Complete                    |
| `NFR-SEC-008`   | Runaway process timeout and process-tree cleanup remain verified                                                                | Complete                    |
| `NFR-SEC-009`   | Process capture, display logs, output files/bytes/count, PDFs, SyncTeX, diagnostics, recovery, and application logs are bounded | Complete for current design |
| `NFR-SEC-010`   | Renderer navigation and popup requests are denied and classified without retaining full URLs                                    | Complete                    |
| `NFR-SEC-011`   | Local CSP blocks network, objects, frames, forms, external bases, and evaluated scripts                                         | Complete                    |
| `NFR-SEC-012`   | High-severity dependency audit runs in CI and passed locally                                                                    | Complete for release gate   |
| `NFR-PRIV-001`  | Source, recovery, logs, compilation, and export remain local                                                                    | Complete for Sprint 10      |
| `NFR-PRIV-002`  | No analytics or telemetry added                                                                                                 | Complete for Sprint 10      |
| `NFR-PRIV-003`  | No crash or diagnostic upload exists                                                                                            | Complete for current design |
| `NFR-PRIV-004`  | Support export redacts home and active-project path forms where practical                                                       | Complete                    |
| `NFR-MAINT-002` | Typed output, recovery, support, IPC, and renderer contracts                                                                    | Complete                    |
| `NFR-MAINT-003` | Recovery, support logging, output limits, retention, and navigation are independent modules                                     | Complete                    |
| `NFR-MAINT-004` | ADR-0012 and `THREAT_MODEL.md` record the security design                                                                       | Complete                    |
| `NFR-MAINT-005` | Unit, component, integration, E2E, and native checks avoid arbitrary sleeps                                                     | Complete                    |
| `NFR-UX-001`    | Recovery and support actions are keyboard-operable controls                                                                     | Current scope complete      |
| `NFR-UX-004`    | Recovery dialog and support controls have accessible names                                                                      | Complete                    |
| `NFR-UX-006`    | Recovery, output-limit, and export failures provide corrective context                                                          | Current scope complete      |
| `AS-008`        | Crash-recovery E2E reviews, restores, preserves disk, then explicitly saves                                                     | Complete                    |
| `AS-009`        | Traversal IPC is rejected and recorded without exposing external content                                                        | Complete                    |

### Sprint 10 evidence

- Sprint report: `reports/SPRINT-10.md`
- Threat model: `THREAT_MODEL.md`
- Process, output, retention, recovery, logging, IPC, navigation, CSP,
  component, integration, and Electron E2E tests: `../tests/`
- Recovery and support modules: `../src/recovery/` and `../src/support/`
- Security decision: `adr/ADR-0012-security-recovery-and-support-data.md`
