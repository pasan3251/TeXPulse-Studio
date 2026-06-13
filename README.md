# TeXPulse Studio

TeXPulse Studio is a planned offline Windows LaTeX editor with local MiKTeX
compilation and side-by-side PDF preview.

Sprint 0 establishes repository and engineering controls only. It intentionally
contains no Electron window, editor, compiler adapter, or PDF viewer.

## Requirements

- Windows 11 x64
- Node.js 24.x
- pnpm 10.12.1 through Corepack
- Git

MiKTeX, `latexmk`, and SyncTeX are required by later compiler sprints, not by
the Sprint 0 quality gate.

## Setup

```powershell
corepack prepare pnpm@10.12.1 --activate
corepack enable pnpm --install-directory "$(npm config get prefix)"
pnpm install --frozen-lockfile
```

## Quality gate

```powershell
pnpm check
```

The aggregate command runs formatting, linting, strict type checking, unit
tests, the current integration and E2E status commands, and the TypeScript
build.

## Documentation

- Product specification: `docs/SRS.md`
- Architecture: `docs/ARCHITECTURE.md`
- Test plan: `docs/TEST_PLAN.md`
- Security baseline: `docs/SECURITY.md`
- Troubleshooting: `docs/TROUBLESHOOTING.md`
- Sprint status: `docs/SPRINT_STATUS.md`
- Requirement traceability: `docs/REQUIREMENTS_TRACEABILITY.md`
- Sprint 0 report: `docs/reports/SPRINT-0.md`
