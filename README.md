# TeXPulse Studio

TeXPulse Studio is an offline Windows LaTeX editor under incremental
development. Sprint 4 provides a secure Electron shell, hierarchical project
explorer, and CodeMirror 6 editor with modified-state tracking, Save, Save All,
cursor/scroll restoration, and visible external-change conflicts. Project files
remain behind a validated main-process IPC boundary.

Compilation UI and PDF preview begin in Sprint 5. The existing Sprint 2 compiler
service remains available through its developer CLI.

## Requirements

- Windows 11 x64
- Node.js 24.x
- pnpm 10.12.1 through Corepack
- Git
- MiKTeX with `latexmk`
- Native Windows Perl available on `PATH`

## Setup

```powershell
corepack prepare pnpm@10.12.1 --activate
corepack enable pnpm --install-directory "$(npm config get prefix)"
pnpm install --frozen-lockfile
```

Start the desktop editor:

```powershell
pnpm app:start
```

## Quality gate

```powershell
pnpm check
```

The aggregate command runs formatting, linting, strict type checking, unit,
component, integration, coverage, and Electron E2E tests, then creates the
production main, renderer, and preload bundles.

## Toolchain doctor

Run the real isolated compile self-test:

```powershell
pnpm texpulse-doctor
```

Use a custom executable directory when needed:

```powershell
pnpm texpulse-doctor -- --custom-bin C:\Strawberry\perl\bin
```

The command emits structured JSON and reports readiness only after the compile
self-test succeeds, unless `--skip-self-test` is explicitly supplied.

## Minimal compile CLI

```powershell
pnpm texpulse-compile -- --project fixtures\minimal-success --root main.tex --timeout 120000
```

Output defaults to generation-isolated directories under
`<project>\.texpulse\build\generations`. Supported recipes are `pdf`, `xelatex`,
and `lualatex`. Pressing `Ctrl+C` cancels the active compiler tree.

This developer service accepts trusted local projects only. Compiler output
bounding and the complete threat model remain later hardening work.

## Desktop editor

The Sprint 4 application:

- opens an existing local project folder;
- renders the bounded project entry list as a hierarchy;
- edits valid UTF-8 project text with LaTeX highlighting, undo/redo, find, and
  replace;
- tracks modified files and preserves cursor/scroll state across switches;
- saves one file or all modified files through version-checked atomic writes;
- reports external-change conflicts without replacing either local unsaved
  content or the external file; and
- denies renderer Node access, arbitrary filesystem access, navigation, popups,
  webviews, and permissions.

The renderer receives project-relative paths only. It cannot access the
filesystem except through the three-method typed preload bridge.

## Project service

The typed modules under `src/project/`:

- canonicalize project roots and reject path escapes;
- list files without traversing symbolic links, junctions, or ignored output;
- read and write UTF-8 text with SHA-256 version tokens;
- reject stale writes after external changes;
- atomically replace saved files where the platform supports rename;
- rank likely LaTeX root files;
- validate `.texpulse/project.json`; and
- persist a bounded recent-project list at an injected application-data path.

## Documentation

- Product specification: `docs/SRS.md`
- Architecture: `docs/ARCHITECTURE.md`
- Test plan: `docs/TEST_PLAN.md`
- Security baseline: `docs/SECURITY.md`
- Troubleshooting: `docs/TROUBLESHOOTING.md`
- Sprint status: `docs/SPRINT_STATUS.md`
- Requirement traceability: `docs/REQUIREMENTS_TRACEABILITY.md`
- Sprint 0 report: `docs/reports/SPRINT-0.md`
- Sprint 1 report: `docs/reports/SPRINT-1.md`
- Sprint 2 report: `docs/reports/SPRINT-2.md`
- Sprint 3 report: `docs/reports/SPRINT-3.md`
- Sprint 4 report: `docs/reports/SPRINT-4.md`
