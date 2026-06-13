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

All compiler, project, Electron, editor, PDF, diagnostics, SyncTeX, recovery,
settings, packaging, and collaboration requirements remain not started. Their
planned sprint assignments are authoritative in `docs/SRS.md`.

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
