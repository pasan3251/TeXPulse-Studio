# TeXPulse Studio

TeXPulse Studio is an offline Windows LaTeX editor under incremental
development. Sprint 11 provides an installable Windows beta plus a secure
Electron editor with autosave, debounced live compilation, project change
detection, workspace restoration, structured source-linked diagnostics, raw
build logs, SyncTeX forward/inverse navigation, selectable recipes, persistent
settings, first-run toolchain setup, clean-build controls, bounded compiler
output, abnormal-shutdown recovery, local support diagnostics, and a PDF.js
preview that retains the last successful output when a later build fails.
Project files and generated artifact paths remain behind a validated
main-process IPC boundary.

## Installed beta requirements

- Windows 11 x64
- MiKTeX with `latexmk`
- Native Windows Perl available on `PATH`

MiKTeX and Perl are not bundled. The first launch runs a real isolated toolchain
self-test before reporting compilation readiness.

## Install

Run the generated assisted installer under `output/package`. The beta installer
is unsigned, so Windows SmartScreen may show a reputation warning. Verify the
artifact source before continuing.

After setup, choose `Open sample project` from the welcome screen, edit
`main.tex`, and compile. The editable copy is stored under TeXPulse Studio's
application data and is preserved during uninstall.

## Development requirements

- Node.js 24.x
- pnpm 10.12.1 through Corepack
- Git
- The installed beta requirements above

## Development setup

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
pnpm audit:dependencies
```

The aggregate command runs formatting, linting, strict type checking, unit,
component, integration, coverage, and Electron E2E tests, then creates the
production main, renderer, and preload bundles.

Build and verify Windows packages:

```powershell
pnpm package:dir
pnpm package:win
pnpm test:packaged
```

The packaged lifecycle installs to a path containing spaces, uses a clean app
profile, runs the real MiKTeX self-test, edits and compiles the bundled sample,
captures high-DPI evidence, reopens the edit, and uninstalls.

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

This developer service accepts trusted local projects only. Process capture,
accepted generated output, and retained generation count are bounded, but TeX
still runs with the local user's permissions and is not OS-sandboxed.

## Desktop editor

The Sprint 11 application:

- installs through an assisted per-user NSIS installer;
- preserves application data during uninstall;
- resolves bundled resources in development and packaged layouts;
- opens an editable bundled sample without exposing an arbitrary path API;
- opens an existing local project folder;
- renders the bounded project entry list as a hierarchy;
- edits valid UTF-8 project text with LaTeX highlighting, undo/redo, find, and
  replace;
- tracks modified files and preserves cursor/scroll state across switches;
- saves one file or all modified files through version-checked atomic writes;
- autosaves editing bursts and automatically compiles after a configurable
  200-5,000 ms debounce, defaulting to 800 ms;
- serializes saves before builds and shows debouncing, saving, queued, and
  compiling phases;
- keeps one compiler process active and only the newest pending build;
- supports disabling automatic build while retaining manual compile;
- stores global settings under Electron application data and project settings in
  `.texpulse/project.json`, with validation and migration;
- provides a first-run toolchain wizard with executable paths, versions, and a
  real isolated compile self-test;
- supports a trusted custom executable directory;
- selects pdfLaTeX, XeLaTeX, or LuaLaTeX recipes per project;
- configures compile timeout, editor font size, and default PDF zoom;
- disables `latexmk` configuration files by default and requires explicit
  per-project trust before loading them;
- provides a clean build and allowlisted generation auxiliary cleanup;
- limits aggregate process output to 8 MiB, accepted generations to 4,096 files,
  128 MiB per file and 512 MiB total, and retained generations to eight;
- saves modified buffers before a manual compile and stops on save conflict;
- displays build status and supports cancellation;
- renders only completed PDFs through PDF.js with page, zoom, fit-width, and
  fit-page controls;
- preserves page, zoom, and approximate scroll state across PDF reloads;
- preserves and labels the last successful PDF after a failed build;
- parses common LaTeX, `latexmk`, BibTeX, and Biber messages into bounded
  structured diagnostics;
- presents visible Error, Warning, and Info labels in a Problems panel;
- marks affected CodeMirror lines and navigates to validated project-relative
  files and source locations;
- clears stale diagnostics after edits and rejects older build generations;
- moves from the current source position to a marked PDF location;
- inverse-searches by double-clicking the PDF, then opens and marks the
  validated project source line;
- disables SyncTeX navigation for edited or retained stale output and reports
  unavailable data non-fatally;
- shows a bounded raw build log while retaining the complete log on disk;
- opens or reveals only a main-process-revalidated generated PDF;
- watches the project without following links or generated output and reports
  external changes without replacing local unsaved content;
- restores open files, active file, cursor/scroll views, and pane ratio for the
  same project;
- offers bounded unsaved-buffer recovery after abnormal shutdown, restores only
  to the editor after review, and never writes recovered text automatically;
- records bounded local application events, exports a practically path-redacted
  support log on request, and provides recovery/log cleanup; and
- denies renderer Node access, arbitrary filesystem access, navigation, popups,
  webviews, and permissions.

The renderer receives project-relative paths, build metadata, opaque artifact
tokens, bounded raw log text, and bounded PDF bytes. Raw compiler output may
contain local path text, but no path becomes a filesystem capability. The
renderer cannot access the filesystem or compiler except through the
twenty-three-method typed preload bridge.

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
- Threat model: `docs/THREAT_MODEL.md`
- Troubleshooting: `docs/TROUBLESHOOTING.md`
- Sprint status: `docs/SPRINT_STATUS.md`
- Requirement traceability: `docs/REQUIREMENTS_TRACEABILITY.md`
- Sprint 0 report: `docs/reports/SPRINT-0.md`
- Sprint 1 report: `docs/reports/SPRINT-1.md`
- Sprint 2 report: `docs/reports/SPRINT-2.md`
- Sprint 3 report: `docs/reports/SPRINT-3.md`
- Sprint 4 report: `docs/reports/SPRINT-4.md`
- Sprint 5 report: `docs/reports/SPRINT-5.md`
- Sprint 6 report: `docs/reports/SPRINT-6.md`
- Sprint 7 report: `docs/reports/SPRINT-7.md`
- Sprint 8 report: `docs/reports/SPRINT-8.md`
- Sprint 9 report: `docs/reports/SPRINT-9.md`
- Sprint 10 report: `docs/reports/SPRINT-10.md`
- Sprint 11 report: `docs/reports/SPRINT-11.md`
- Release notes: `docs/RELEASE_NOTES.md`
