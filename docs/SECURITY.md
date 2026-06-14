# Security

## Sprint 10 posture

Sprint 10 keeps the Electron renderer outside the trusted computing boundary
while adding process/output bounds, abnormal-shutdown recovery, local structured
logging, redacted support export, stricter navigation policy, and a
dependency-audit release gate. It adds no network service, telemetry, remote
content, arbitrary filesystem access, general renderer process capability, or
production dependency. The implementation-matched threat model is
`THREAT_MODEL.md`.

The application:

- uses `spawn(executable, args, { shell: false })`;
- passes paths as argument-array entries;
- validates the project and root file through canonical paths;
- rejects build paths that lexically or through filesystem links leave the
  project;
- writes output under `.texpulse/build` by default;
- passes `-norc` by default and omits it only after explicit per-project trust;
- always passes `-no-shell-escape`;
- reports only output paths that exist;
- enforces a default 120-second compiler timeout;
- limits aggregate child stdout/stderr capture to 8 MiB and terminates the
  process tree when the limit is reached;
- cancels by build ID through `AbortController`;
- terminates Windows compiler descendants with direct, shell-free
  `taskkill.exe /T /F`;
- isolates outputs by generation so stale or failed builds cannot overwrite the
  retained successful PDF;
- accepts only regular generated files, with at most 4,096 files, 128 MiB per
  file, and 512 MiB total per generation;
- rejects and link-safely removes output that exceeds quotas or contains links
  or non-regular entries;
- retains at most eight recognized build generations while preserving the
  current and visible successful output;
- rejects adapter results with mismatched build identity;
- canonicalizes the selected project directory;
- accepts only relative project entry paths and verifies resolved paths remain
  below the canonical root;
- rejects traversal through project-internal symbolic links and junctions;
- lists link entries without following them;
- decodes editor files as bounded valid UTF-8 text;
- saves through a same-directory temporary file with sync and atomic rename;
- requires a SHA-256 version token before replacing a file;
- reports changed or deleted external files explicitly;
- validates and migrates project and global settings, safely falling back with
  visible issues;
- ignores generated and dependency directories during project enumeration;
- enables the Electron sandbox before app readiness;
- uses `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, and
  `webSecurity: true`;
- disables renderer Node access in frames and workers;
- exposes twenty-two frozen project/build/PDF/SyncTeX/settings/recovery/event
  preload methods, never `ipcRenderer`;
- validates the sending web contents and main frame for every IPC call;
- validates every IPC request and response with strict Zod schemas;
- keeps the absolute project root out of renderer responses;
- denies permission requests, popups, webviews, and unexpected navigation;
- denies renderer-originated external navigation instead of exposing an
  external-URL capability;
- logs only the rejected URL scheme rather than the complete URL;
- disables DevTools for production and packaged windows; and
- applies a local-only Content Security Policy with no network connections,
  objects, forms, external bases, inline scripts, or evaluated scripts;
- permits only a same-origin PDF.js worker through `worker-src 'self'`;
- returns build metadata and opaque artifact tokens without structured canonical
  paths;
- revalidates artifact identity, canonical generation paths, and file type
  before PDF reads or desktop shell actions;
- limits PDF preview input to 100 MiB and renderer raw-log display to 2 MiB;
- loads only completed compiler output into PDF.js;
- keeps the last successful PDF visible after failure; and
- uses Electron shell open/reveal only for a revalidated generated PDF;
- starts the project watcher in the main process, never the renderer;
- prevents watcher traversal through symbolic links and junctions;
- excludes generated, metadata, dependency, coverage, and distribution
  directories from watcher traversal;
- suppresses editor-originated watcher events by matching resulting file
  versions;
- sends only an opaque project ID, relative path, and validated event kind to
  the renderer;
- treats watcher events as informational rather than direct save/build triggers;
- serializes saves and retains version-token checks before automatic builds;
- rejects build and PDF results when the renderer source revision changed; and
- persists only validated relative workspace state and preferences, never source
  text, PDF bytes, logs, canonical paths, or credentials;
- stores bounded dirty-buffer recovery separately under Electron `userData`,
  keyed by opaque project ID;
- limits recovery to 20 buffers, 2 MiB per buffer, and 10 MiB total;
- restores recovery into dirty editor state only after explicit user review and
  never writes project files automatically;
- records bounded structured application events in a 1 MiB current log plus one
  rotated log without storing document content by default;
- exports support logs only after user action and redacts home and active
  project paths where practical;
- lets the user clear project recovery or all recovery and application logs;
- parses only the bounded renderer log copy in a pure module without filesystem
  or process access;
- limits each build response to 200 diagnostics, 4,096 message characters, and
  2,048 excerpt characters per diagnostic;
- resolves diagnostic links only to files enumerated inside the open project and
  returns project-relative paths;
- discards unknown absolute paths as navigation targets;
- sends diagnostics through a strict Zod response schema;
- rejects stale diagnostic generations and clears accepted diagnostics after
  source edits;
- renders messages and excerpts as escaped React text, never HTML; and
- reuses the existing validated `readTextFile` capability for source navigation;
- accepts SyncTeX requests only for the current visible successful artifact;
- validates forward source paths through the canonical project service;
- resolves inverse paths only against enumerated project files and returns only
  project-relative paths;
- invokes SyncTeX with argument arrays, `shell: false`, a five-second timeout,
  and the canonical project working directory;
- removes `SYNCTEX_VIEWER` and `SYNCTEX_EDITOR` before invocation;
- parses no more than 512 KiB of SyncTeX result text; and
- reports missing, malformed, failed, or stale navigation non-fatally without
  repeating canonical paths or child output;
- stores global settings under Electron `userData` and project settings under
  validated `.texpulse/project.json`;
- resolves only fixed executable names from a user-selected custom tool
  directory and displays the resulting paths and versions;
- runs toolchain readiness through the isolated doctor fixture rather than a
  user project;
- never equates a skipped self-test with a successful compile;
- treats `.latexmkrc` and other `latexmk` configuration files as executable
  trusted input and warns before enabling them;
- performs clean builds through the normal timeout, cancellation, generation,
  and stale-result controls;
- deletes only allowlisted auxiliary suffixes under validated generation
  directories, skips links and junctions, and preserves PDFs, logs, SyncTeX
  data, and unknown files; and
- rejects project-settings changes and cleanup while session work could race.

CodeMirror injects runtime styles, so the CSP currently permits inline styles.
Inline and evaluated scripts remain disallowed. This exception is documented in
ADR-0006 and must not be widened to scripts.

PDF.js 6.0.227 is pinned as a production dependency because the SRS requires a
local PDF.js viewer. It is lazy-loaded with its local worker and is covered by
the frozen lockfile and dependency audit.

Chokidar 5.0.0 is pinned as a production dependency because recursive native
Windows project watching, event normalization, atomic-write handling, and
link-following controls are required for live external-change detection. It runs
only in the main process and is covered by the same lockfile, audit, path
boundary, and integration tests.

The raw user-visible compiler log may contain local absolute paths and
environment details emitted by MiKTeX or `latexmk`. These strings do not become
filesystem capabilities, and source remains local, but the path-text exposure is
intentional for unmodified troubleshooting output.

Structured diagnostics do not repeat arbitrary absolute paths in their `file`
field. A path becomes selectable only when it matches a known project-relative
entry. Raw excerpts may still contain the original local path text because they
are troubleshooting text, not capabilities.

The product remains a trusted local-project editor rather than a hostile-code
sandbox. TeX executes with the desktop user's permissions. Generated-output
quotas are checked after process exit, so transient disk or resource use is
possible until timeout. Multi-user or hosted compilation requires a separately
reviewed sandboxed execution design.

A custom executable directory and enabled `latexmk` configuration are explicit
local trust decisions. They do not enable TeX shell escape, but they can select
or execute user-controlled local programs and Perl configuration respectively.

## Product security invariants

- Treat the renderer and all user-controlled data as untrusted.
- Keep `nodeIntegration: false` and `contextIsolation: true`.
- Expose only narrow, typed, validated preload APIs.
- Canonicalize paths and enforce project boundaries.
- Use executable plus argument arrays for compiler and SyncTeX processes.
- Keep TeX shell escape disabled by default.
- Enforce compile timeout, cancellation, output bounds, and process cleanup.
- Reject stale build results.
- Reject stale file-version tokens before replacement.
- Do not traverse project-internal links or junctions.
- Validate external URLs and configure a Content Security Policy.
- Keep source content local and omit analytics from the initial release.

## Dependency policy

- Production dependencies require a documented reason.
- Versions are pinned by `package.json` and `pnpm-lock.yaml`.
- CI uses a frozen lockfile.
- Dependency vulnerability review is a release gate under `NFR-SEC-012`.
- Security findings must not be hidden by disabling tests or lint rules.
- Covered compiler, project, Electron session/IPC, renderer state, and toolchain
  modules enforce at least 85% aggregate statement and branch coverage.
- Electron and renderer dependencies are pinned exactly and audited through the
  same frozen lockfile.

## Future work

Packaging, installer paths, signing, clean-profile behavior, and installed
runtime assumptions require Sprint 11 review. Automatic external-file
reload/merge and any new preload or external-URL capability require their own
validated contracts and tests. ADR-0005 defines the path/link policy; ADR-0006
defines the Electron boundary; ADR-0007 defines completed PDF loading and
artifact actions; ADR-0008 defines live build and project watching; ADR-0009
defines structured diagnostic parsing and source links; ADR-0010 defines the
SyncTeX process, artifact, path, and renderer boundary; ADR-0011 defines
settings, toolchain readiness, `latexmk` trust, and cleanup; ADR-0012 defines
output bounds, recovery, support data, and navigation denial.
