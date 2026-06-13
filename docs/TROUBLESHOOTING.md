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

## MakeIndex version is unknown

The MiKTeX MakeIndex executable is runnable but does not expose a parseable
version flag. The doctor reports the executable path and a warning rather than
inventing a version.

## Compile output is missing

Inspect the JSON `failureReason`, `exitCode`, `stdout`, and `stderr`. Successful
output should exist under
`<project>\.texpulse\build\generations\<generation>-<build-id>`.

## Build timed out

`texpulse-compile` defaults to 120 seconds and exits with code 124 on timeout.
Set a positive timeout explicitly when needed:

```powershell
pnpm texpulse-compile -- --project <directory> --root main.tex --timeout 180000
```

Do not disable the timeout for unknown or intentionally non-terminating TeX.

## Build cancellation

Press `Ctrl+C` while `texpulse-compile` is running. A cancelled build exits with
code 130. On Windows the service invokes `taskkill.exe /T /F` directly without a
shell so descendant Perl and TeX processes are terminated with the launcher.

## Project file changed externally

Every text read returns a content version token. If another program changes the
file before TeXPulse saves, the write fails with a `conflict` error and leaves
the external content and unsaved editor buffer intact. Reopen or reconcile the
content before retrying.

## Project path is rejected

Project entry paths must be relative and remain inside the canonical project
root. TeXPulse reports internal symbolic links and junctions in enumeration but
does not traverse, read through, rename through, or delete through them.

## Project metadata falls back to defaults

Project settings live at `.texpulse/project.json`. Invalid JSON, invalid fields,
or an unsupported schema version return safe defaults with issue messages.
Correct the metadata instead of bypassing validation.

## WSL detected

Do not combine WSL paths or Node.js with native Windows MiKTeX for the MVP.
Reopen the repository in a native Windows PowerShell/Codex environment and
follow `adr/ADR-0002-windows-development-environment.md`.
