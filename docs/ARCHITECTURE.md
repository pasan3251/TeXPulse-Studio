# Architecture

## Current state

Sprint 0 contains only repository controls and a deterministic health marker.
There is no Electron application, renderer, compiler, editor, or PDF viewer.

## Planned system boundaries

The SRS defines these future boundaries:

1. An untrusted Electron renderer for React, CodeMirror, and PDF.js.
2. A narrow typed preload bridge with validated IPC contracts.
3. A privileged main process for project files, settings, and process control.
4. A compiler adapter interface separating MiKTeX/`latexmk` from application
   state and deterministic fake compilers used by tests.
5. Pure modules for path validation, build generations, diagnostics, settings,
   and SyncTeX parsing.

## Mandatory invariants

- Electron renderer Node integration remains disabled.
- Context isolation remains enabled.
- User-controlled paths and IPC payloads are validated.
- Compiler commands use executable and argument arrays, never ordinary
  `shell: true`.
- Shell escape is disabled by default.
- Builds support timeout, cancellation, and stale-result rejection.
- Source files remain local and are not silently rewritten.

## Decision records

- `adr/ADR-0001-desktop-stack.md`
- `adr/ADR-0002-windows-development-environment.md`

Packaging, build-directory trust, `.latexmkrc`, compiler adapter details, PDF
loading, and link/junction policies require later ADRs before implementation.
