# TeXPulse Studio

TeXPulse Studio is an offline Windows LaTeX editor under incremental
development. Sprint 2 provides a local MiKTeX compiler service with newest-only
queueing, generations, cancellation, timeout, and process-tree cleanup.

There is no Electron window, editor, or PDF viewer yet.

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

## Quality gate

```powershell
pnpm check
```

The aggregate command runs formatting, linting, strict type checking, unit
tests, fake-process integration tests, pure-module coverage, the current E2E
status command, and the TypeScript build.

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
