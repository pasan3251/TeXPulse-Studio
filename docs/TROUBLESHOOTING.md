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
prototype output should exist under `<project>\.texpulse\build`.

## WSL detected

Do not combine WSL paths or Node.js with native Windows MiKTeX for the MVP.
Reopen the repository in a native Windows PowerShell/Codex environment and
follow `adr/ADR-0002-windows-development-environment.md`.
