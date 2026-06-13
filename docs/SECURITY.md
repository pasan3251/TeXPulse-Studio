# Security

## Sprint 1 posture

Sprint 1 adds trusted-local-project compiler execution outside Electron. It adds
no network service, renderer, telemetry, or production dependency.

The prototype:

- uses `spawn(executable, args, { shell: false })`;
- passes paths as argument-array entries;
- validates the project and root file through canonical paths;
- rejects build paths that lexically or through filesystem links leave the
  project;
- writes output under `.texpulse/build` by default;
- passes `-norc` and `-no-shell-escape`;
- reports only output paths that exist.

It is not approved for untrusted TeX input because timeout, cancellation,
process-tree cleanup, and output bounds are scheduled for later sprints.

## Product security invariants

- Treat the renderer and all user-controlled data as untrusted.
- Keep `nodeIntegration: false` and `contextIsolation: true`.
- Expose only narrow, typed, validated preload APIs.
- Canonicalize paths and enforce project boundaries.
- Use executable plus argument arrays for compiler and SyncTeX processes.
- Keep TeX shell escape disabled by default.
- Enforce compile timeout, cancellation, output bounds, and process cleanup.
- Reject stale build results.
- Validate external URLs and configure a Content Security Policy.
- Keep source content local and omit analytics from the initial release.

## Dependency policy

- Production dependencies require a documented reason.
- Versions are pinned by `package.json` and `pnpm-lock.yaml`.
- CI uses a frozen lockfile.
- Dependency vulnerability review is a release gate under `NFR-SEC-012`.
- Security findings must not be hidden by disabling tests or lint rules.
- Pure compiler/toolchain modules enforce at least 85% statement and branch
  coverage.

## Future work

A detailed threat model, trusted-project policy, path/link policy, IPC schema,
and TeX execution review are required before the corresponding features ship.
