# Contributing

## Before changing code

1. Read `AGENTS.md`, `docs/SRS.md`, and `docs/SPRINT_STATUS.md`.
2. Confirm the requested sprint and map work to SRS requirements.
3. Inspect Git status and preserve unrelated user changes.
4. Use native Windows Node.js and tools for the MVP.

## Development

Install the pinned dependencies:

```powershell
pnpm install --frozen-lockfile
```

Run the complete current quality gate:

```powershell
pnpm check
```

For editor/PDF work, run the focused renderer and Electron suites:

```powershell
pnpm test:component
pnpm test:e2e
pnpm app:start
```

Keep renderer code unprivileged. New capabilities must use narrow typed preload
methods, validate IPC requests and responses in the main process, and preserve
project-relative path boundaries. Do not expose `ipcRenderer`, Node globals, or
absolute project or artifact paths to the renderer.

For compiler work, use the fake-process integration suite for deterministic
automation and label real MiKTeX evidence separately:

```powershell
pnpm test:integration
pnpm test:coverage
pnpm texpulse-doctor
```

The intentional infinite-loop fixture under `fixtures/timeout/` must only be run
through a path that supplies an enforced compiler timeout.

For project-filesystem work, preserve the canonical-root boundary, reject
internal links and junctions, and use read-version tokens for destructive file
replacement. Add integration coverage for Windows path behavior, Unicode,
external modifications, and read-only failures.

For React changes, preserve keyboard access, accessible names, visible
non-color-only states, and the CodeMirror cursor/scroll contract. Add component
or Electron E2E coverage for user-visible workflows.

Use `pnpm format` to apply formatting. Do not weaken tests, lint rules, strict
TypeScript settings, Electron security constraints, or compiler safety rules to
make a change pass.

## Pull requests

- Keep changes within one sprint.
- Include requirement IDs and test evidence.
- Update architecture, security, test, status, and traceability documents when
  behavior changes.
- Report skipped or unavailable real MiKTeX tests honestly.
- Do not commit generated build output, dependency directories, logs, or user
  LaTeX projects.
