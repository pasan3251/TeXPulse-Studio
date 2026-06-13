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
pnpm test:coverage
pnpm test:e2e
pnpm build
pnpm check
pnpm app:start
pnpm texpulse-doctor -- --custom-bin <directory>
pnpm texpulse-compile -- --project <directory> --root main.tex --timeout 120000
```

`pnpm test:e2e` builds and exercises rapid editing, autosave, queued
compilation, newest-result PDF rendering, manual build, restoration, minimum
window layout, and external-conflict preservation. Packaging begins in Sprint
11, so no packaging command exists yet.

The compiler service enforces timeout, cancellation, and process-tree cleanup.
It remains limited to trusted local projects until output bounds and the full
security hardening sprint are complete.

The project service treats symbolic links and junctions inside an open project
as non-traversable entries. Text replacement is atomic where supported and
requires the version token returned by the latest read.

The main-process project watcher does not follow links and ignores generated,
metadata, dependency, coverage, and distribution directories. It suppresses
matching editor-originated writes. Watcher events are validated, project-scoped
notices and never direct save or compile triggers.

The renderer is sandboxed with Node integration disabled. Its frozen preload
bridge exposes nine fixed project/build/PDF/event methods. PDF paths remain in
the main process as actionable values, and renderer PDF loads require an active
opaque artifact token. Raw compiler logs may contain local path text.

## Completion checklist

- Applicable tests pass.
- The complete diff has been reviewed.
- Documentation is updated.
- `docs/SPRINT_STATUS.md` is updated.
- `docs/REQUIREMENTS_TRACEABILITY.md` is updated.
- Known limitations are reported honestly.
