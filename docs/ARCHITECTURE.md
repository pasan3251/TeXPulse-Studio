# Architecture

## Current state

Sprint 5 connects manual compilation and completed PDF output to the desktop
application:

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
- `ipc/`: strict Zod request/response schemas and stable project, build, and PDF
  channel names.
- `electron/`: sandboxed BrowserWindow construction, permission/navigation
  denial, trusted-sender IPC handlers, a session owning project/build state, and
  a frozen eight-method preload bridge.
- `renderer/`: React workspace state, deterministic project hierarchy,
  CodeMirror 6 LaTeX editor, build controls, raw log panel, lazy PDF.js viewer,
  retained-output status, error boundary, and desktop layout.
- `cli/`: JSON `texpulse-doctor` and `texpulse-compile` entry points.

There is still no diagnostics parser, live file watcher, autosave/auto-build,
SyncTeX navigation UI, or settings UI.

## System boundaries

The implemented and planned boundaries are:

1. An untrusted sandboxed Electron renderer for React, CodeMirror, and PDF.js.
2. A narrow typed preload bridge with no raw `ipcRenderer` exposure.
3. A privileged main process that validates sender, frame, request, response,
   and project path before filesystem work.
4. A compiler adapter interface separating MiKTeX/`latexmk` from application
   state and deterministic fake compilers used by tests.
5. Pure modules for path validation, build generations, diagnostics, settings,
   and SyncTeX parsing.

## Sprint 4 editor flow

```text
renderer action
  -> frozen preload method
  -> fixed IPC channel
  -> trusted webContents and main-frame check
  -> strict Zod request validation
  -> active ProjectService
  -> canonical project boundary and versioned file operation
  -> strict Zod response validation
  -> reducer-owned renderer buffer state
```

The renderer receives a project basename, relative entries, root candidates, and
relative file snapshots. It receives no canonical project root as a structured
capability, although raw compiler logs may contain local path text. File reads
may complete out of order; stale completions populate cache but cannot replace
the newest selection.

CodeMirror owns editing behavior while the reducer owns source buffers, saved
content, version tokens, active file, modified state, cursor, scroll, pending
saves, and user notices. Editor input remains independent of asynchronous file
I/O.

## Sprint 5 build and PDF flow

```text
Compile action
  -> save every modified buffer with its latest version token
  -> fixed compile IPC request containing the relative root file
  -> session-owned BuildController and compiler adapter
  -> generation-isolated completed result
  -> bounded build view plus opaque artifact identity
  -> artifact token and canonical generation-path revalidation
  -> bounded Uint8Array PDF response
  -> lazy PDF.js worker and canvas render
```

The renderer receives no canonical artifact path as a structured or actionable
value. Raw compiler logs may contain local path text. Open and reveal actions
send only the active build ID and generation back to the main process, which
resolves and revalidates the visible artifact before calling Electron shell
APIs.

The reducer retains loaded PDF bytes across failed builds and marks them as
last-successful. Source edits also mark the displayed PDF as retained. PDF page,
zoom mode, custom zoom, and approximate scroll position survive replacement by a
newer successful artifact.

## Project flow

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
CLI or desktop `ProjectSession`
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
- Renderer sandboxing remains enabled.
- Popups, navigation, webviews, and permissions remain denied by default.
- User-controlled paths and IPC payloads are validated.
- Compiler commands use executable and argument arrays, never ordinary
  `shell: true`.
- Shell escape is disabled by default.
- Builds support timeout, cancellation, and stale-result rejection.
- Source files remain local and are not silently rewritten.
- Project-internal links and junctions are visible but not traversed.
- File replacement requires a matching content version token.
- The renderer never receives unrestricted IPC or filesystem primitives.
- The renderer receives no canonical PDF path capability; artifact actions
  require a current opaque build token. Raw compiler logs may contain path text.
- PDF preview bytes and renderer log text are bounded before crossing IPC.

## Decision records

- `adr/ADR-0001-desktop-stack.md`
- `adr/ADR-0002-windows-development-environment.md`
- `adr/ADR-0003-compiler-prototype-safety.md`
- `adr/ADR-0004-build-orchestration-and-process-cleanup.md`
- `adr/ADR-0005-project-filesystem-boundary.md`
- `adr/ADR-0006-secure-electron-shell-and-ipc.md`
- `adr/ADR-0007-pdf-preview-and-artifact-boundary.md`

Packaging requires a later ADR before implementation.
