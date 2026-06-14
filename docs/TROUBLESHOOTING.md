# Troubleshooting

## `pnpm` is not found

Provision the pinned version through Corepack. On Windows installations where
`Program Files` is not writable, place the shims in the user npm directory:

```powershell
corepack prepare pnpm@10.12.1 --activate
corepack enable pnpm --install-directory "$(npm config get prefix)"
pnpm --version
```

## Engine mismatch

Sprint 0 requires Node.js 24.x and pnpm 10.12.1. The repository enables strict
engine checks, so unsupported versions fail installation instead of producing an
unverified environment.

## Electron did not download during install

Electron's package script downloads the pinned Windows runtime. Confirm that
`electron` is allowed under `onlyBuiltDependencies`, that GitHub release assets
are reachable, and rerun:

```powershell
pnpm install --frozen-lockfile
```

Do not substitute an unverified executable. Any manual recovery must verify the
release archive against Electron's published checksum before extraction.

## The desktop window is blank

Build all three application surfaces and restart Electron:

```powershell
pnpm build
pnpm app:start
```

Renderer assets live under `dist/renderer`; the sandbox preload must be
`dist/electron/preload.cjs`. Packaged/production windows intentionally disable
DevTools.

## `latexmk` reports that Perl is missing

MiKTeX's `latexmk` launcher requires a Perl interpreter. Install a supported
native Windows Perl distribution, ensure `perl.exe` is on `PATH`, then rerun:

```powershell
latexmk --version
pnpm texpulse-doctor
```

Strawberry Perl can be installed with:

```powershell
winget install --id StrawberryPerl.StrawberryPerl --exact
```

If the current terminal predates the installation, open a new terminal or pass
the directory explicitly:

```powershell
pnpm texpulse-doctor -- --custom-bin C:\Strawberry\perl\bin
```

## MiKTeX update warning

Open MiKTeX Console and check for updates before the first real compiler smoke
test. Do not report toolchain readiness until the real self-test defined by the
SRS succeeds.

## First-run setup reports not ready

The first launch opens the toolchain setup dialog. Run the real self-test and
inspect each reported executable path, version, and state. Application readiness
means the editor can start; toolchain readiness additionally requires a
successful isolated LaTeX compile.

Use the custom executable directory only when the required native Windows tools
are not discoverable on `PATH`. TeXPulse resolves fixed tool names from that
directory. Selecting it is a local trust decision because those executables will
be launched for checks and builds.

`Skip self-test and continue` is explicit. It completes setup without claiming
that a real compile succeeded.

## MakeIndex version is unknown

The MiKTeX MakeIndex executable is runnable but does not expose a parseable
version flag. The doctor reports the executable path and a warning rather than
inventing a version.

## Compile output is missing

Inspect the JSON `failureReason`, `exitCode`, `stdout`, and `stderr`. Successful
output should exist under
`<project>\.texpulse\build\generations\<generation>-<build-id>`.

In the desktop editor, open the raw build log. A failed or missing-output build
keeps the previous successful PDF visible and labels it `Last successful build`.

## A build failed but no source line is shown

Open `Problems` after the build. Located errors and warnings are buttons that
open the project file and focus the reported line. Messages without a validated
project file or line remain visible but are intentionally not selectable.

Use `Show log` to inspect the bounded raw compiler output. An unrecognized log
format produces a fallback problem and does not hide the raw log. The complete
MiKTeX log remains in the generation directory under
`<project>\.texpulse\build\generations`.

If a newly created source file is named in the log but does not link, reopen the
project so its bounded entry list is refreshed. Diagnostic paths are accepted
only when they match a file enumerated in the open project.

## A missing package is reported

The Problems panel identifies common `File ... not found` and `latexmk` missing
input messages. Check the document path first. For a missing `.sty` or `.cls`,
open MiKTeX Console, install or update the named package, then compile again.

MiKTeX may be configured to install missing packages automatically. Do not
enable shell escape or bypass project path validation to work around a package
error.

## PDF preview failed

The viewer loads only a completed, readable generated PDF and limits preview
input to 100 MiB. Retry the build and inspect the raw log if the output is
missing or malformed. A PDF.js rendering error does not delete the generated
file or the previous successful preview.

`Open PDF` requires a Windows application associated with `.pdf`. `Reveal`
requires Windows Explorer. Both actions revalidate the active generated artifact
before invoking the operating system.

## SyncTeX navigation is unavailable

Forward search requires a current successful build and an open source file.
Double-click the rendered PDF page for inverse search. If either action reports
stale data, compile the current source again.

If the build did not produce `main.synctex.gz`, confirm that `synctex` is
available on `PATH`, that the build command includes `-synctex=1`, and that
MiKTeX is current. Results are accepted only when the returned source matches a
file enumerated inside the open project; reopen after adding a new source file.

TeXPulse does not invoke an external SyncTeX editor or viewer. It removes
`SYNCTEX_EDITOR` and `SYNCTEX_VIEWER` from the child environment and performs
navigation inside the application.

## Build timed out

`texpulse-compile` defaults to 120 seconds and exits with code 124 on timeout.
Set a positive timeout explicitly when needed:

```powershell
pnpm texpulse-compile -- --project <directory> --root main.tex --timeout 180000
```

Do not disable the timeout for unknown or intentionally non-terminating TeX. The
desktop timeout is configured under Settings and is applied to subsequent normal
and clean builds.

## Build cancellation

Press `Ctrl+C` while `texpulse-compile` is running. A cancelled build exits with
code 130. On Windows the service invokes `taskkill.exe /T /F` directly without a
shell so descendant Perl and TeX processes are terminated with the launcher.

## Autosave or live build did not run

Autosave and automatic build are enabled by default with an 800 ms debounce.
Confirm that both toolbar checkboxes are enabled and that editing has paused for
the selected delay. The visible phase progresses through `Debouncing`, `Saving`,
`Queued` when another build is active, and `Compiling`.

An automatic build does not start when a version-token save fails. Resolve the
visible conflict first. Turning off automatic build does not disable the manual
`Compile` action.

Generated files under `.texpulse`, the configured build directory,
`node_modules`, `dist`, and `coverage` do not trigger live builds.

The global automatic-build setting is the default for projects without metadata.
Once project settings are saved, the project's own automatic-build value takes
precedence.

## The selected recipe is wrong

Open Settings and choose pdfLaTeX, XeLaTeX, or LuaLaTeX for the current project.
The recipe, root file, build directory, and automatic-build choice are stored in
`.texpulse/project.json`.

BibTeX and Biber are driven by `latexmk` when the document requests them.
Confirm the relevant executable is reported by the toolchain check and inspect
the raw build log when bibliography output is missing.

## `.latexmkrc` is ignored

TeXPulse passes `-norc` by default. Enable `Trust latexmk configuration files`
for the current project only after reviewing its `.latexmkrc` and any other
configuration that `latexmk` may load. These files are Perl and may execute
commands while loading.

This trust option does not enable TeX shell escape. TeXPulse continues to pass
`-no-shell-escape`.

## Clean build or auxiliary cleanup failed

`Clean build` starts a new generation with the selected recipe and
`latexmk -gg`. It retains timeout, cancellation, and newest-result controls.

`Clean auxiliary files` removes only recognized auxiliary files inside
generation directories. It preserves PDFs, logs, SyncTeX data, and unknown
files; it does not run `latexmk -c` or load project cleanup hooks. Cleanup and
settings changes are rejected while a build or another maintenance operation is
active. Wait for the current operation to finish and retry.

## Project file changed externally

The main process watches the open project and reports added, changed, or deleted
files. Editor-originated saves and generated output are filtered to prevent
rebuild loops. An external-change notice never overwrites the editor buffer or
starts a save/build by itself.

Every text read also returns a content version token. If another program changes
the file before TeXPulse saves, the write fails with a `conflict` error and
leaves the external content and unsaved editor buffer intact. Reopen or
reconcile the content before retrying.

## Workspace state did not restore

After reopening the same project in the same app profile, TeXPulse restores
available open files, the active file, cursor and scroll views, and pane ratio.
Missing or renamed files are skipped.

Workspace state is stored in validated application-local browser storage keyed
by an opaque project ID. Settings use the main-process global and project
stores. Source content, PDFs, logs, and build state are not stored, so a
restored editor may show no preview until the next successful build.

## Project path is rejected

Project entry paths must be relative and remain inside the canonical project
root. TeXPulse reports internal symbolic links and junctions in enumeration but
does not traverse, read through, rename through, or delete through them.

## Project metadata falls back to defaults

Project settings live at `.texpulse/project.json`. Invalid JSON, invalid fields,
or an unsupported schema version return safe defaults with issue messages.
Correct the metadata instead of bypassing validation.

Schema version 1 project metadata migrates to version 2 with `latexmk`
configuration trust disabled. Global settings also migrate from the known legacy
schema. Unsupported or malformed data produces a visible recovery notice.

## WSL detected

Do not combine WSL paths or Node.js with native Windows MiKTeX for the MVP.
Reopen the repository in a native Windows PowerShell/Codex environment and
follow `adr/ADR-0002-windows-development-environment.md`.
