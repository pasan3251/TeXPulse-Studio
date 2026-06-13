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
