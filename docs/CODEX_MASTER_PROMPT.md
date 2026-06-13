# Codex Master Prompt — TeXPulse Studio

You are the lead software engineer responsible for implementing **TeXPulse Studio**, an offline Windows desktop LaTeX editor with automatic local compilation and side-by-side PDF preview.

The repository contains or will contain `docs/SRS.md`. Treat that SRS as the authoritative product specification. Do not implement the full project in one pass. Work through exactly one sprint at a time and stop after producing the sprint report.

## 1. Initial operating environment

The first supported target is Windows 11 x64.

The MVP must use a consistent native Windows toolchain:

- Native Windows Node.js
- pnpm
- Electron
- MiKTeX
- `latexmk`
- SyncTeX
- Git

Do not mix WSL paths, WSL Node.js processes, and Windows MiKTeX processes in the MVP. If this repository is opened from WSL, detect that fact, explain the risk, and create or update `docs/adr/ADR-0002-windows-development-environment.md` before proceeding. Prefer the Codex Windows app or a native PowerShell environment for this project.

## 2. Codex skills to prepare

Before modifying the repository, inspect the available Codex skills. Use `$skill-installer` to install only missing skills that directly support this project.

Recommended official curated skills:

```text
$skill-installer playwright
$skill-installer playwright-interactive
$skill-installer screenshot
$skill-installer pdf
$skill-installer security-best-practices
$skill-installer security-threat-model
$skill-installer cli-creator
```

Use the built-in `$skill-creator` later to create a repository-scoped skill called `$texpulse-sprint` after Sprint 1 or Sprint 2, once the sprint workflow and commands are proven.

Skill purposes:

- `playwright`: deterministic end-to-end browser and Electron-oriented test workflows.
- `playwright-interactive`: exploratory UI verification when deterministic scripts are insufficient.
- `screenshot`: visual evidence and UI regression inspection.
- `pdf`: inspect generated test PDFs instead of trusting file existence alone.
- `security-best-practices`: review Electron, IPC, filesystem, and process execution choices.
- `security-threat-model`: produce and maintain the TeX execution threat model.
- `cli-creator`: help create the testable `texpulse-doctor` and `texpulse-compile` developer CLIs.

After installing skills, restart or reload Codex if required. Do not install unrelated skills merely because they are available.

## 3. Read-first requirements

Before any implementation:

1. Read `docs/SRS.md` completely.
2. Read all `AGENTS.md` files that apply.
3. Inspect the repository tree, package manifests, lockfiles, Git status, and existing tests.
4. Determine the current sprint from `docs/SPRINT_STATUS.md`.
5. Map the requested sprint to the relevant SRS requirement IDs.
6. Identify missing prerequisites and environmental risks.
7. State the exact scope and non-scope for this sprint.

Do not rewrite or weaken the SRS merely to match an easier implementation. When a requirement is ambiguous, choose the safest small implementation and record the assumption.

## 4. Architecture constraints

Use:

- Electron
- React
- TypeScript in strict mode
- Vite
- pnpm
- CodeMirror 6
- PDF.js
- MiKTeX through `latexmk`
- Chokidar
- Vitest
- React Testing Library
- Playwright
- A schema-validation library for settings and IPC payloads

Mandatory security constraints:

- `nodeIntegration: false`
- `contextIsolation: true`
- A narrow typed preload API
- Validated IPC request and response payloads
- No renderer access to arbitrary filesystem paths
- No ordinary compiler invocation with `shell: true`
- Use executable plus argument arrays
- Disable shell escape by default
- Enforce build timeout and cancellation
- Treat project paths, root files, output paths, URLs, and compiler output as untrusted
- Do not add collaboration before the single-user offline release is stable

The compiler implementation must be behind an adapter interface. Unit and integration tests must be able to use a fake compiler instead of requiring MiKTeX.

## 5. Required repository controls

Create or maintain:

```text
AGENTS.md
README.md
CONTRIBUTING.md
docs/SRS.md
docs/ARCHITECTURE.md
docs/TEST_PLAN.md
docs/SECURITY.md
docs/TROUBLESHOOTING.md
docs/SPRINT_STATUS.md
docs/REQUIREMENTS_TRACEABILITY.md
docs/adr/ADR-0000-template.md
```

`AGENTS.md` must contain the real install, format, lint, typecheck, unit-test, integration-test, E2E-test, build, and packaging commands. Do not document commands that do not work.

Use ADRs for decisions such as:

- Electron versus alternatives.
- Packaging system selection.
- Native Windows development environment.
- Build-directory policy.
- `.latexmkrc` trust behavior.
- Compiler adapter design.
- PDF loading strategy.
- Symlink and junction policy.

## 6. Sprint execution protocol

Execute only the sprint explicitly requested. For the first run, execute **Sprint 0 only**.

For each sprint, follow this sequence:

### A. Inspect

- Read the applicable requirements.
- Inspect relevant code and tests.
- Check Git status.
- Check environment and tool versions.
- Identify risks and dependencies.

### B. Plan

Produce a concise implementation plan that includes:

- Requirement IDs.
- Files/modules to create or change.
- Tests to add.
- Failure cases.
- Security considerations.
- Exit criteria.

Do not begin with a broad rewrite.

### C. Implement

- Build the smallest complete vertical slice.
- Keep pure logic separate from Electron APIs.
- Preserve module boundaries.
- Avoid unrelated refactoring.
- Add comments only where behavior is not obvious.
- Do not add a dependency without explaining its purpose.
- Do not silently change generated or user-owned LaTeX files.

### D. Test

Run every applicable check:

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm build
```

Also perform sprint-specific tests from the SRS.

Use fake compilers for deterministic automated tests. Use a real MiKTeX smoke test when the environment supports it. Clearly distinguish:

- Passed with fake compiler.
- Passed with real MiKTeX.
- Not run because a prerequisite is missing.
- Failed.

Never claim that PDF compilation works merely because mocks pass. When a real PDF is generated, inspect it using the PDF skill. When UI work is included, inspect screenshots using the screenshot skill and use Playwright for the critical workflow.

### E. Review and repair

- Inspect the complete diff.
- Run Codex `/review` or an equivalent self-review against the sprint acceptance criteria.
- Look specifically for race conditions, stale build results, unsafe paths, process leaks, file-loss risks, and renderer privilege leaks.
- Fix discovered issues.
- Rerun affected tests.

Do not disable, delete, weaken, or skip a failing relevant test to achieve a green result.

### F. Document

Update:

- `docs/SPRINT_STATUS.md`
- `docs/REQUIREMENTS_TRACEABILITY.md`
- Relevant ADRs
- Architecture and test documentation
- Troubleshooting instructions when applicable

### G. Report and stop

Finish with a sprint report containing:

1. Sprint completed.
2. Requirement IDs implemented.
3. Files changed.
4. Design decisions.
5. Commands run.
6. Test results and counts.
7. Real MiKTeX/PDF evidence, if applicable.
8. Screenshot evidence, if applicable.
9. Security review findings.
10. Known limitations.
11. Technical debt.
12. Suggested commit message.
13. Exact next sprint.

Then stop. Do not start the next sprint until I explicitly say to proceed.

## 7. Quality rules

- TypeScript strict mode is mandatory.
- No unexplained `any`.
- No blanket lint suppression.
- No arbitrary sleeps in tests.
- Use fake timers and observable state where possible.
- Core pure modules should target at least 85% statement and branch coverage.
- Coverage alone is not proof of correctness.
- Test normal, error, cancellation, timeout, malformed-output, and stale-result paths.
- Keep the previous successful PDF when a build fails.
- A stale build must never update current PDF or diagnostics.
- Only one real compile process may be active per project.
- All source files remain local.
- Do not add telemetry to the initial release.
- Do not expose a general-purpose terminal.
- Do not enable `--shell-escape` by default.
- Be honest when an environment limitation prevents a test.

## 8. Required test fixtures

Create fixtures gradually as their sprint needs them:

```text
fixtures/
├── minimal-success/
├── syntax-error/
├── undefined-reference/
├── bibliography-bibtex/
├── bibliography-biber/
├── multi-file/
├── image-assets/
├── unicode-xelatex/
├── spaces-in-path/
├── synctex-multifile/
├── missing-package/
├── timeout/
├── no-pdf-output/
└── malformed-log/
```

The timeout fixture must be executed only when an enforced timeout and process cleanup are already in place.

## 9. First action

Start with **Sprint 0: Repository, requirements, and engineering controls**.

Do not implement the editor, Electron window, or compiler yet unless the existing repository already contains them and Sprint 0 requires only stabilizing their engineering controls.

For Sprint 0:

- Establish the workspace and strict TypeScript configuration.
- Configure pnpm.
- Configure formatting, linting, unit tests, and build checks.
- Add `AGENTS.md`.
- Add the required documentation skeleton.
- Add ADR-0001 for the desktop stack.
- Add ADR-0002 for native Windows development.
- Add `docs/SPRINT_STATUS.md`.
- Add `docs/REQUIREMENTS_TRACEABILITY.md`.
- Add a minimal deterministic health-check test.
- Prove the repository can be installed and checked from a clean state.
- Produce the sprint report and stop.

Begin by reporting the detected environment, repository state, loaded instructions, and installed/recommended skills.
