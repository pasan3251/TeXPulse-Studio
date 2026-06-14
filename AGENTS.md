# AGENTS.md

## Project

TeXPulse Studio is an offline Windows LaTeX editor. Read `docs/SRS.md` before
changing code and treat it as the authoritative product specification.

## Working agreement

- Work on one sprint only.
- Check `docs/SPRINT_STATUS.md` before implementation.
- Map changes to SRS requirement IDs.
- Prefer small vertical slices.
- Do not add production dependencies without documenting why.
- Do not weaken or skip relevant tests.
- Do not claim real LaTeX compilation passed unless MiKTeX produced a PDF and
  that PDF was inspected.
- Stop after the sprint report.

## Security rules

- Keep Electron `nodeIntegration` disabled.
- Keep `contextIsolation` enabled.
- Expose only typed, validated preload APIs.
- Do not use `shell: true` for ordinary compilation.
- Spawn executables with argument arrays.
- Disable TeX shell escape by default.
- Validate and canonicalize project paths.
- Do not traverse project-internal symbolic links or junctions.
- Require version-token checks before replacing externally editable files.
- Enforce compiler timeout and cancellation.
- Never allow stale build output to replace the newest result.

## Prerequisites

- Native Windows 11 x64 environment.
- Node.js 24.x.
- pnpm 10.12.1, provisioned with Corepack.
- MiKTeX with `latexmk`.
- Native Windows Perl on `PATH` because MiKTeX's `latexmk` requires it.

If the global Corepack directory is not writable, create user-level shims:

```powershell
corepack prepare pnpm@10.12.1 --activate
corepack enable pnpm --install-directory "$(npm config get prefix)"
```

## Verified commands

```text
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:component
pnpm test:integration
pnpm test:performance
pnpm test:coverage
pnpm test:e2e
pnpm test:packaged
pnpm audit:dependencies
pnpm build
pnpm package:dir
pnpm package:win
pnpm release:manifest
pnpm check
pnpm app:start
pnpm texpulse-doctor -- --custom-bin <directory>
pnpm texpulse-compile -- --project <directory> --root main.tex --timeout 120000
```

`pnpm test:e2e` builds and exercises rapid editing, autosave, queued
compilation, newest-result PDF rendering, manual build, restoration, minimum
window layout, external-conflict preservation, structured diagnostic display,
raw-log access, source navigation, retained PDF behavior, fix-error cleanup,
sample onboarding, project creation/mutation/export/recent reopening, and
abnormal-shutdown recovery without automatic source overwrite.
`pnpm test:packaged` additionally installs the NSIS release candidate into a
path with spaces, uses clean and previous-beta profiles, runs the real MiKTeX
self-test, edits and compiles the sample, reopens it, and uninstalls.

The compiler service enforces timeout, cancellation, process-tree cleanup, an 8
MiB aggregate process-output limit, generated-output quotas, and an
eight-generation retention policy. It remains limited to trusted local projects
because TeX is not OS-sandboxed and explicitly trusted custom tools or `latexmk`
configuration can execute local code.

The project service treats symbolic links and junctions inside an open project
as non-traversable entries. Text replacement is atomic where supported and
requires the version token returned by the latest read.

The main-process project watcher does not follow links and ignores generated,
metadata, dependency, coverage, and distribution directories. It suppresses
matching editor-originated writes. Watcher events are validated, project-scoped
notices and never direct save or compile triggers.

The renderer is sandboxed with Node integration disabled. Its frozen preload
bridge exposes thirty-one fixed
project/build/PDF/SyncTeX/settings/recovery/event methods. PDF paths remain in
the main process as actionable values, and renderer PDF loads require an active
opaque artifact token. Raw compiler logs may contain local path text.

Recovery snapshots are bounded, project-scoped, stored under application data,
and restored only to dirty editor buffers after explicit review. Structured
application logs avoid source content by default, rotate at bounded size, and
redact home/project paths when exported where practical.

Structured diagnostics are parsed from the bounded display log in a pure module.
They are limited to enumerated project-relative source links, 200 items, 4,096
message characters, and 2,048 excerpt characters. Parser failure must preserve
the raw log, and stale or edited source must not retain current diagnostics.

The Windows release candidate is packaged with Electron Builder and an assisted
per-user NSIS installer. MiKTeX and Perl are not bundled. The unsigned release
candidate preserves application data on uninstall and may trigger Windows
reputation warnings.

## Completion checklist

- Applicable tests pass.
- The complete diff has been reviewed.
- Documentation is updated.
- `docs/SPRINT_STATUS.md` is updated.
- `docs/REQUIREMENTS_TRACEABILITY.md` is updated.
- Known limitations are reported honestly.
