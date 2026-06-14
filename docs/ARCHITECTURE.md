# Architecture

## Current state

Sprint 15 extends the complete Windows release candidate with explorer and PDF
usability improvements while preserving the editor, build, diagnostic, SyncTeX,
settings, recovery, support, and security controls:

- `process/`: shell-free child process boundary with timeout, cancellation,
  process-tree cleanup, and bounded aggregate capture.
- `toolchain/`: executable discovery, version parsing, readiness probe, and
  isolated doctor self-test.
- `compiler/`: validated project paths, fixed recipe and clean-build `latexmk`
  argument arrays, allowlisted auxiliary cleanup, generated-output quotas,
  generation retention, and cancellable structured compile results.
- `build/`: per-project state machine, generation IDs, newest-only queue,
  debounce foundation, stale-result rejection, timeout, and last-successful
  metadata.
- `diagnostics/`: pure bounded parsing for LaTeX, `latexmk`, BibTeX, Biber,
  malformed output, and build status events.
- `synctex/`: bounded result parsing and shell-free forward/inverse invocation.
- `project/`: canonical project roots, non-traversable link policy, ignored
  output enumeration, UTF-8 file CRUD and recursive copy, atomic versioned
  saves, validated entry resolution for desktop reveal, root detection, project
  metadata, recent-project storage, fixed-template creation, source-only
  streaming ZIP export, and filtered Chokidar events.
- `settings/`: strict global and project schemas, safe defaults, migration, and
  atomic application-data persistence.
- `recovery/`: atomic, bounded, project-ID-keyed unsaved-buffer snapshots.
- `support/`: bounded structured application logging, rotation, practical path
  redaction, export, and cleanup.
- `ipc/`: strict Zod request/response schemas and stable project, build, PDF,
  SyncTeX, and read-only Git-status channel names.
- `electron/`: sandboxed BrowserWindow construction, permission/navigation
  denial, trusted-sender IPC handlers, packaged/development resource resolution,
  a session owning project/build state, and a frozen thirty-four-method preload
  bridge.
- `packaging`: Electron Builder x64 ASAR output, assisted per-user NSIS
  installer, metadata/icon resources, tagged source and artifact provenance, and
  a packaged clean/upgrade lifecycle harness.
- `resources/`: fixed bundled sample source used by the doctor and copied once
  into application data as an editable project.
- `renderer/`: React workspace state, deterministic project hierarchy,
  material-inspired explorer icons and scoped context menus, CodeMirror 6 LaTeX
  editor, active standalone-root selection, pure live-build coordination,
  validated workspace persistence, resizable panes, build controls,
  source-linked Problems and raw log panels, diagnostic and SyncTeX target
  markers, continuously scrolling PDF.js viewer, retained-output status,
  read-only Git summary, settings/setup dialog, error boundary, and desktop
  layout.
- `cli/`: JSON `texpulse-doctor` and `texpulse-compile` entry points.

The release candidate has no updater, bundled TeX distribution, code-signing
certificate, cross-platform package, or collaboration runtime. Sprint 14 adds
only collaboration research controls in `COLLABORATION_SRS.md`,
`COLLABORATION_THREAT_MODEL.md`, and ADR-0015.

## System boundaries

The implemented and planned boundaries are:

1. An untrusted sandboxed Electron renderer for React, CodeMirror, and PDF.js.
2. A narrow typed preload bridge with no raw `ipcRenderer` exposure.
3. A privileged main process that validates sender, frame, request, response,
   and project path before filesystem work.
4. A compiler adapter interface separating MiKTeX/`latexmk` from application
   state and deterministic fake compilers used by tests.
5. Pure modules for path validation, build generations, diagnostics, settings,
   recovery, support logging, navigation policy, output limits, retention,
   Git-status parsing, and SyncTeX parsing.
6. Future collaboration, if implemented, must be a separately feature-flagged
   boundary that is absent from the stable offline path by default.

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

## Sprint 6 live feedback flow

```text
CodeMirror edit
  -> reducer records a new source revision
  -> pure coordinator resets the configured debounce
  -> serialized version-token save of every dirty buffer
  -> session-owned newest-only BuildController request
  -> visible debouncing / saving / queued / compiling phase
  -> main current-result disposition
  -> renderer source-revision and buffer-content revalidation
  -> artifact load with a second revision check
  -> current PDF replacement or stale result rejection
```

Manual compile uses the same save and validation path and remains available when
automatic build is disabled. A queued request moves to compiling as the active
request completes; no second compiler process overlaps the first.

The project session starts one Chokidar watcher after opening a project. It does
not follow links and ignores `.git`, `.texpulse`, `node_modules`, `dist`,
`coverage`, and the configured build directory. Internal writes are associated
with the resulting version token so matching watcher events are suppressed.
Other events cross a single validated event channel as an opaque project ID,
relative path, and event kind. The renderer warns without automatically saving,
reloading, or compiling.

Workspace persistence is keyed by the opaque project ID and contains only
relative open paths, active path, cursor and scroll views, and pane ratio.
Source text, PDF bytes, logs, canonical paths, settings, and build state are not
stored.

## Sprint 7 diagnostic flow

```text
completed current build
  -> bounded raw log assembled in the main process
  -> pure diagnostic parser
  -> known project-relative file resolution only
  -> strict diagnostic IPC schema
  -> generation and renderer-revision acceptance checks
  -> Problems panel plus CodeMirror line decorations
  -> validated project read and editor focus on selection
```

The parser emits at most 200 diagnostics. Messages are bounded to 4,096
characters and excerpts to 2,048 characters. It recognizes common LaTeX,
`latexmk`, BibTeX, and Biber formats, reconstructs MiKTeX file-line messages
wrapped at 79 columns, and emits status diagnostics for timeout and
cancellation. Unknown failed output receives a fallback problem without removing
or rewriting the raw log.

Only paths already enumerated by the open project can become diagnostic file
links. Absolute paths in logs are reduced to a known project-relative suffix or
discarded. Selecting a located problem uses the existing validated
`readTextFile` preload method, then moves CodeMirror focus and selection to the
bounded line/column. No preload capability was added.

The renderer rejects older build generations and source revisions before
diagnostics can become current. Any edit clears the accepted diagnostic set and
line decorations until the next current build completes.

## Sprint 8 SyncTeX flow

```text
current source or PDF position
  -> strict forward/inverse request with opaque build identity
  -> current PDF and generation-path revalidation
  -> validated source path or bounded PDF coordinates
  -> shell-free `synctex` process with helper environment removed
  -> bounded output parser and known-project-file resolution
  -> relative source target or numeric PDF target
  -> CodeMirror line marker or PDF overlay marker
```

Only the current successful artifact may be queried. Retained output after an
edit or failed build produces a non-fatal stale message. Inverse results become
actionable only when their path matches an enumerated project file. The renderer
receives no canonical source, project, PDF, or SyncTeX path.

## Sprint 9 settings and maintenance flow

```text
first launch or Settings action
  -> fixed settings/toolchain preload method
  -> trusted sender and strict request schema
  -> global userData store plus project metadata v2
  -> known migration or safe fallback with visible issues
  -> isolated real doctor self-test
  -> renderer receives readiness, paths, versions, and bounded messages
```

Global settings own tool location, autosave, new-project auto-build default,
debounce, timeout, editor font size, PDF zoom mode, and setup completion.
Project settings own root file, recipe, build directory, automatic builds, and
the explicit `latexmk` configuration trust decision.

Clean build requests use the selected recipe and `latexmk -gg` in a fresh
generation. Auxiliary cleanup is an application-owned recursive walk limited to
validated generation directories and known auxiliary suffixes. It skips links
and preserves PDFs, logs, SyncTeX files, and unknown output. Project-settings
changes, builds, and cleanup cannot race within one project session.

## Sprint 10 recovery and support flow

```text
dirty editor buffers
  -> 500 ms bounded snapshot request
  -> strict recovery schema and active-project identity check
  -> atomic application-data snapshot
  -> abnormal restart and explicit review dialog
  -> restore to dirty reducer buffers without filesystem writes
  -> existing version-token Save writes only after user action
```

The renderer submits at most 20 dirty buffers, 2 MiB each and 10 MiB total.
Stored paths must still match validated files in the active project. Invalid or
malformed snapshots are rejected and cleared rather than applied.

Security-relevant IPC rejection, build completion summaries, renderer crashes,
application startup, support export, and data cleanup become bounded structured
events. Values are sanitized and truncated. The current application log is
limited to 1 MiB with one rotated predecessor. Export is user initiated and
redacts the Windows home path and active project path where practical.

Renderer navigation and popup requests are denied. The product does not expose
an external-URL method because no implemented workflow requires one.

## Sprint 11 packaging and sample flow

```text
development package or NSIS installer
  -> ASAR application plus fixed external sample resource
  -> development resources/ or packaged process.resourcesPath
  -> first-run settings/toolchain self-test
  -> fixed openSampleProject IPC with no renderer path
  -> copy missing sample file into Electron userData
  -> preserve existing edits and reject links/non-files
  -> normal canonical ProjectSession and compiler/PDF flow
```

The installer is per-user, allows a destination containing spaces, and preserves
application data during uninstall. MiKTeX and Perl remain external
prerequisites. The package contains no updater or network service. The beta is
unsigned; signing and release reputation require a later operational decision.

## Sprint 12 project and release flow

```text
renderer project action
  -> one of eight fixed project/recent/export preload methods
  -> trusted sender and strict request/response schema
  -> idle ProjectSession with watcher paused for mutation
  -> canonical ProjectService path and version checks
  -> refreshed bounded project description and restarted watcher

source-only export
  -> main-process native save destination
  -> canonical project enumeration without following links
  -> exclude .git, .texpulse, dependencies, distribution, coverage, and build output
  -> streaming stored ZIP entries with CRC-32 and temporary-file replacement

release candidate
  -> complete deterministic, Electron, native, and installed suites
  -> tagged source archive plus installer/application SHA-256 manifest
```

Project creation accepts no renderer-selected destination or template. The main
process selects the destination and copies the fixed bundled `main.tex` only
into a missing directory. Recent projects cross the renderer boundary as bounded
opaque IDs plus basename-only labels; canonical paths remain entirely in the
main process. File deletion requires explicit modal confirmation, and folder
mutation never traverses links or junctions.

ZIP export uses a small application-owned classic ZIP writer instead of a new
runtime dependency. It writes only regular project files, skips links, and
excludes generated and dependency directories by default. Export runs only while
the build/session maintenance boundary is idle.

The release performance suite measures the 1,000-file project path, editor
reducer latency, and repeated-build heap behavior. The packaged suite verifies a
clean application profile and the previous beta's schema-version-1 settings.

## Sprint 15 explorer and preview flow

```text
explorer action
  -> relative source and destination paths through fixed typed preload methods
  -> trusted sender and strict request/response validation
  -> canonical ProjectService boundary and non-traversable link checks
  -> recursive copy, versioned move, confirmed delete, or desktop reveal
  -> refreshed bounded project description

build action
  -> active .tex file compared with detected standalone root candidates
  -> active standalone root or configured project-root fallback
  -> existing save, queue, generation, and stale-result controls

completed PDF
  -> bounded bytes and opaque artifact identity
  -> all pages rendered in one scrollable PDF.js viewport
  -> visible page, zoom, fit mode, scroll state, and SyncTeX behavior retained
```

The renderer never receives an absolute path for project reveal. It submits a
project-relative path, and the main process resolves and validates the entry
immediately before calling Electron's desktop shell API. Copy operations reject
links and copying a directory into itself. Cut remains an application-owned
copy/move intent and uses the existing validated mutation boundary.

Active-file compilation applies only when the selected `.tex` file is a detected
standalone root. Included chapter fragments continue to build through the
configured root, preserving multi-file project behavior.

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

Project metadata lives in `.texpulse/project.json` with schema version 2.
Version 1 migrates with `latexmk` configuration trust disabled. Invalid fields
receive safe defaults with issues, while unsupported schema versions fall back
as a whole. Global settings use a separate atomic file under Electron
`userData`; legacy schema version 0 migrates to version 1. Recent-project
storage uses a separate injected application-data path.

## Compiler flow

```text
CLI or desktop `ProjectSession`
  -> per-project build controller
  -> build ID and monotonically increasing generation
  -> newest-only pending request
  -> current validated global and project settings
  -> validated project, root, and build paths
  -> generation-isolated output directory
  -> Node process runner with shell disabled
  -> latexmk recipe with timeout, cancellation, shell escape disabled,
     and configuration files disabled unless explicitly trusted
  -> bounded aggregate stdout/stderr capture
  -> Windows process-tree cleanup with taskkill /T /F
  -> regular-file, count, per-file, and total-byte output inspection
  -> reject and remove invalid generations without following links
  -> retain at most eight recognized generations
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
- `latexmk` configuration files are disabled by default and require explicit
  project trust.
- Builds support timeout, cancellation, and stale-result rejection.
- Child process capture and accepted generated output are bounded.
- Generation retention preserves current visible output and removes only
  recognized application-owned generation directories.
- Clean builds retain the normal generation and stale-result controls.
- Auxiliary cleanup is allowlisted, project-bounded, and never traverses links.
- Source files remain local and are not silently rewritten.
- Project-internal links and junctions are visible but not traversed.
- File replacement requires a matching content version token.
- Autosaves are serialized before a compile request.
- Watcher events are informational, project-scoped, and never trigger direct
  filesystem writes or builds.
- Stale renderer revisions cannot accept build or PDF results even when the
  main-process generation is current.
- Stale generations or edited source cannot retain current diagnostics.
- Diagnostic links are limited to enumerated project-relative files.
- SyncTeX requests require the current opaque artifact identity.
- SyncTeX inverse paths are limited to enumerated project-relative files.
- SyncTeX viewer/editor helper environment variables are removed before spawn.
- Untrusted diagnostic text is bounded and rendered as escaped React text.
- The renderer never receives unrestricted IPC or filesystem primitives.
- The renderer receives no canonical PDF path capability; artifact actions
  require a current opaque build token. Raw compiler logs may contain path text.
- PDF preview bytes and renderer log text are bounded before crossing IPC.
- Recovery requires explicit review and never writes source automatically.
- Application logs avoid source content by default and support redacted export
  and user-controlled cleanup.
- Collaboration implementation remains absent by default. Future collaboration
  must not add preload methods, listeners, dependencies, UI, or network exposure
  unless an explicit experimental flag is enabled.

## Decision records

- `adr/ADR-0001-desktop-stack.md`
- `adr/ADR-0002-windows-development-environment.md`
- `adr/ADR-0003-compiler-prototype-safety.md`
- `adr/ADR-0004-build-orchestration-and-process-cleanup.md`
- `adr/ADR-0005-project-filesystem-boundary.md`
- `adr/ADR-0006-secure-electron-shell-and-ipc.md`
- `adr/ADR-0007-pdf-preview-and-artifact-boundary.md`
- `adr/ADR-0008-live-build-and-project-watching.md`
- `adr/ADR-0009-structured-diagnostics.md`
- `adr/ADR-0010-synctex-navigation-boundary.md`
- `adr/ADR-0011-settings-toolchain-and-latexmk-trust.md`
- `adr/ADR-0012-security-recovery-and-support-data.md`
- `adr/ADR-0013-windows-packaging-and-sample-project.md`
- `adr/ADR-0014-project-management-and-release-provenance.md`
- `adr/ADR-0015-collaboration-research-prototype.md`
