# ADR-0001: Desktop Application Stack

- Status: Accepted
- Date: 2026-06-13
- Deciders: TeXPulse maintainers
- Related requirements: SRS §7, §8, `NFR-MAINT-003`, `NFR-SEC-001`

## Context

TeXPulse Studio needs a Windows desktop shell, a modern editor, local process
integration, and an embedded PDF viewer while preserving a testable separation
between privileged and untrusted code.

## Decision

Use Electron, React, TypeScript in strict mode, and Vite. Use CodeMirror 6 for
editing and PDF.js for preview. Keep compiler, filesystem, settings,
diagnostics, and SyncTeX logic behind typed modules outside renderer UI code.

Sprint 0 records this stack but does not install or implement its product
dependencies.

## Alternatives considered

- Tauri: smaller runtime, but the SRS selects Electron and the team needs the
  JavaScript ecosystem and mature PDF/editor integrations.
- Native Windows UI: strong platform integration, but weaker alignment with the
  selected web UI libraries and cross-platform future.
- Browser-only application: cannot satisfy offline local process and filesystem
  requirements without a separate privileged service.

## Consequences

- Electron security settings and narrow validated IPC are mandatory.
- Renderer code is treated as untrusted.
- Runtime size is larger than native alternatives.
- Pure logic remains independently testable without launching Electron.

## Validation

Sprint 4 must assert BrowserWindow security options, preload boundaries, and IPC
validation in automated tests before the desktop shell is accepted.
