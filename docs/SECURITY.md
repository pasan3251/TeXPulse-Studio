# Security

## Sprint 4 posture

Sprint 4 adds the first Electron renderer and keeps it outside the trusted
computing boundary. It adds no network service, telemetry, remote content,
compiler UI, or PDF viewer.

The application:

- uses `spawn(executable, args, { shell: false })`;
- passes paths as argument-array entries;
- validates the project and root file through canonical paths;
- rejects build paths that lexically or through filesystem links leave the
  project;
- writes output under `.texpulse/build` by default;
- passes `-norc` and `-no-shell-escape`;
- reports only output paths that exist.
- enforces a default 120-second compiler timeout;
- cancels by build ID through `AbortController`;
- terminates Windows compiler descendants with direct, shell-free
  `taskkill.exe /T /F`;
- isolates outputs by generation so stale or failed builds cannot overwrite the
  retained successful PDF;
- rejects adapter results with mismatched build identity.
- canonicalizes the selected project directory;
- accepts only relative project entry paths and verifies resolved paths remain
  below the canonical root;
- rejects traversal through project-internal symbolic links and junctions;
- lists link entries without following them;
- decodes editor files as bounded valid UTF-8 text;
- saves through a same-directory temporary file with sync and atomic rename;
- requires a SHA-256 version token before replacing a file;
- reports changed or deleted external files explicitly;
- validates project metadata and safely falls back with issues; and
- ignores generated and dependency directories during project enumeration.
- enables the Electron sandbox before app readiness;
- uses `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, and
  `webSecurity: true`;
- disables renderer Node access in frames and workers;
- exposes only three frozen preload methods, never `ipcRenderer`;
- validates the sending web contents and main frame for every IPC call;
- validates every IPC request and response with strict Zod schemas;
- keeps the absolute project root out of renderer responses;
- denies permission requests, popups, webviews, and unexpected navigation;
- disables DevTools for production and packaged windows; and
- applies a local-only Content Security Policy with no network connections,
  objects, forms, external bases, inline scripts, or evaluated scripts.

CodeMirror injects runtime styles, so the CSP currently permits inline styles.
Inline and evaluated scripts remain disallowed. This exception is documented in
ADR-0006 and must not be widened to scripts.

It is not approved for untrusted TeX input because compiler output is not yet
bounded and the complete threat model is scheduled for Sprint 10.

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
- Covered pure compiler, project, and toolchain modules enforce at least 85%
  aggregate statement and branch coverage.
- Electron and renderer dependencies are pinned exactly and audited through the
  same frozen lockfile.

## Future work

A detailed threat model, trusted-project policy, bounded compiler output, and
TeX execution review remain required before release. Live file watching,
external URL handling, PDF loading, and any new preload capability require their
own validated contracts and tests. ADR-0005 defines the path/link policy;
ADR-0006 defines the Electron and IPC boundary.
