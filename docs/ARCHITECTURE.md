# Architecture

## Current state

Sprint 3 adds a safe project service beside the Sprint 2 compiler service:

- `process/`: shell-free child process boundary.
- `toolchain/`: executable discovery, version parsing, readiness probe, and
  isolated doctor self-test.
- `compiler/`: validated project paths, fixed `latexmk` argument arrays, and
  cancellable structured compile results.
- `build/`: per-project state machine, generation IDs, newest-only queue,
  debounce foundation, stale-result rejection, timeout, and last-successful
  metadata.
- `project/`: canonical project roots, non-traversable link policy, ignored
  output enumeration, UTF-8 file CRUD, atomic versioned saves, root detection,
  project metadata, and recent-project storage.
- `cli/`: JSON `texpulse-doctor` and `texpulse-compile` entry points.

There is still no Electron application, renderer, editor, diagnostics parser, or
PDF viewer.

## Planned system boundaries

The SRS defines these future boundaries:

1. An untrusted Electron renderer for React, CodeMirror, and PDF.js.
2. A narrow typed preload bridge with validated IPC contracts.
3. A privileged main process for project files, settings, and process control.
4. A compiler adapter interface separating MiKTeX/`latexmk` from application
   state and deterministic fake compilers used by tests.
5. Pure modules for path validation, build generations, diagnostics, settings,
   and SyncTeX parsing.

## Sprint 3 project flow

```text
project directory
  -> canonical root and directory validation
  -> relative project path normalization
  -> lexical boundary check
  -> component-by-component lstat
  -> reject internal symbolic links and junctions
  -> UTF-8 read plus SHA-256 version token
  -> save to same-directory temporary file and fsync
  -> compare expected version and atomically rename
  -> explicit conflict instead of silent external overwrite
```

Project enumeration reports link entries but never descends into them. It
ignores `.git`, `.texpulse`, `node_modules`, `dist`, `coverage`, and the
validated project-specific build directory. The flat typed entry list is the
service foundation for the hierarchical tree in Sprint 4.

Project metadata lives in `.texpulse/project.json` with schema version 1.
Invalid fields receive safe defaults with issues, while unsupported schema
versions fall back as a whole. Recent-project storage uses a separate injected
application-data path.

## Compiler flow

```text
CLI
  -> per-project build controller
  -> build ID and monotonically increasing generation
  -> newest-only pending request
  -> validated project, root, and build paths
  -> generation-isolated output directory
  -> Node process runner with shell disabled
  -> latexmk with timeout and cancellation signal
  -> Windows process-tree cleanup with taskkill /T /F
  -> current result or stale result rejected from current state
  -> retained last-successful PDF metadata
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
- Project-internal links and junctions are visible but not traversed.
- File replacement requires a matching content version token.

## Decision records

- `adr/ADR-0001-desktop-stack.md`
- `adr/ADR-0002-windows-development-environment.md`
- `adr/ADR-0003-compiler-prototype-safety.md`
- `adr/ADR-0004-build-orchestration-and-process-cleanup.md`
- `adr/ADR-0005-project-filesystem-boundary.md`

Packaging and PDF loading require later ADRs before implementation.
