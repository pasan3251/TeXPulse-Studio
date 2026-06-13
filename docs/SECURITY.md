# Security

## Sprint 0 posture

Sprint 0 adds no network service, Electron renderer, filesystem API, compiler
execution, telemetry, or production dependency. Its attack surface is limited to
development tooling and CI configuration.

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

## Future work

A detailed threat model, trusted-project policy, path/link policy, IPC schema,
and TeX execution review are required before the corresponding features ship.
