# ADR-0002: Native Windows Development Environment

- Status: Accepted
- Date: 2026-06-13
- Deciders: TeXPulse maintainers
- Related requirements: SRS §6.13, `NFR-COMP-001`, `NFR-COMP-002`

## Context

The MVP invokes native MiKTeX tools and works with Windows paths. Mixing WSL
Node.js, WSL paths, and Windows compiler processes creates quoting, path
translation, file watching, cancellation, and packaging risks.

## Decision

Develop and validate the MVP with native Windows x64 Node.js, pnpm, Electron,
Git, MiKTeX, `latexmk`, SyncTeX, and PowerShell. Do not use WSL processes or
paths in the supported MVP workflow.

The Sprint 0 environment is compliant: Windows x64 PowerShell and native Windows
tools were detected with no WSL variables present.

## Alternatives considered

- WSL-only toolchain: incompatible with the initial MiKTeX target.
- Mixed WSL and Windows processes: rejected because path and process semantics
  are unreliable for the required safety controls.
- Containerized development: deferred because Windows Electron packaging and
  native MiKTeX integration still require host validation.

## Consequences

- CI uses `windows-latest`.
- Contributors need a native Windows environment for supported end-to-end and
  packaging evidence.
- Cross-platform support requires later adapters, CI, and ADRs.

## Validation

Environment checks and sprint reports record OS, architecture, executable paths,
and tool versions. Real compiler claims require native MiKTeX evidence.
