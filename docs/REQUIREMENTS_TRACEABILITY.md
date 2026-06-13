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
