# Architecture

## Current state

Sprint 1 adds a compiler-core prototype outside Electron:

- `process/`: shell-free child process boundary.
- `toolchain/`: executable discovery, version parsing, readiness probe, and
  isolated doctor self-test.
- `compiler/`: validated project paths, fixed `latexmk` argument arrays, and
  structured compile results.
- `cli/`: JSON `texpulse-doctor` and `texpulse-compile` entry points.

There is still no Electron application, renderer, editor, build controller,
diagnostics parser, or PDF viewer.

## Planned system boundaries

The SRS defines these future boundaries:

1. An untrusted Electron renderer for React, CodeMirror, and PDF.js.
2. A narrow typed preload bridge with validated IPC contracts.
3. A privileged main process for project files, settings, and process control.
4. A compiler adapter interface separating MiKTeX/`latexmk` from application
   state and deterministic fake compilers used by tests.
5. Pure modules for path validation, build generations, diagnostics, settings,
   and SyncTeX parsing.

## Sprint 1 compiler flow

```text
CLI
  -> tool discovery / readiness probe
  -> validated project, root, and build paths
  -> Node process runner with shell disabled
  -> latexmk with -norc and -no-shell-escape
  -> structured result with existing PDF/log/SyncTeX paths
```

The doctor copies the minimal fixture into a temporary directory and removes it
after the self-test, so it does not modify user projects.

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
- `adr/ADR-0003-compiler-prototype-safety.md`

Packaging, full compiler-controller design, PDF loading, and the final
link/junction policy require later ADRs before implementation.
