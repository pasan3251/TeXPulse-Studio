# Security

## Sprint 5 posture

Sprint 5 keeps the Electron renderer outside the trusted computing boundary
while adding manual compiler control and completed PDF preview. It adds no
network service, telemetry, remote content, arbitrary filesystem access, or
general process capability.

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
- exposes eight frozen project/build/PDF preload methods, never `ipcRenderer`;
- validates the sending web contents and main frame for every IPC call;
- validates every IPC request and response with strict Zod schemas;
- keeps the absolute project root out of renderer responses;
- denies permission requests, popups, webviews, and unexpected navigation;
- disables DevTools for production and packaged windows; and
- applies a local-only Content Security Policy with no network connections,
  objects, forms, external bases, inline scripts, or evaluated scripts.
- permits only a same-origin PDF.js worker through `worker-src 'self'`;
- returns build metadata and opaque artifact tokens without structured canonical
  paths;
- revalidates artifact identity, canonical generation paths, and file type
  before PDF reads or desktop shell actions;
- limits PDF preview input to 100 MiB and renderer raw-log display to 2 MiB;
- loads only completed compiler output into PDF.js;
- keeps the last successful PDF visible after failure; and
- uses Electron shell open/reveal only for a revalidated generated PDF.

CodeMirror injects runtime styles, so the CSP currently permits inline styles.
Inline and evaluated scripts remain disallowed. This exception is documented in
ADR-0006 and must not be widened to scripts.

PDF.js 6.0.227 is pinned as a production dependency because the SRS requires a
local PDF.js viewer. It is lazy-loaded with its local worker and is covered by
the frozen lockfile and dependency audit.

The raw user-visible compiler log may contain local absolute paths and
environment details emitted by MiKTeX or `latexmk`. These strings do not become
filesystem capabilities, and source remains local, but the path-text exposure is
intentional for unmodified troubleshooting output.

It is not approved for untrusted TeX input because total compiler output and
generated-file counts are not yet bounded and the complete threat model is
scheduled for Sprint 10.

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

A detailed threat model, trusted-project policy, bounded total compiler output,
generation cleanup, and TeX execution review remain required before release.
Live file watching, external URL handling, and any new preload capability
require their own validated contracts and tests. ADR-0005 defines the path/link
policy; ADR-0006 defines the Electron boundary; ADR-0007 defines completed PDF
loading and artifact actions.
