# ADR-0012: Security bounds, recovery, and support data

- Status: Accepted
- Date: 2026-06-14
- Deciders: TeXPulse maintainers
- Related requirements: `FR-REC-001` through `FR-REC-008`, `NFR-SEC-009` through
  `NFR-SEC-012`, `NFR-PRIV-001` through `NFR-PRIV-004`, `AS-008`, and `AS-009`

## Context

Sprint 10 must reduce denial-of-service, data-loss, renderer-compromise, and
privacy risks without adding a production dependency or weakening the existing
project, process, and Electron boundaries. Unsaved text needs local recovery,
but automatic restoration must not overwrite externally editable project files.
Troubleshooting needs durable local events without copying document content into
logs by default.

## Decision

- Bound aggregate process stdout/stderr capture to 8 MiB and terminate the
  process tree when the limit is reached.
- Accept a generation only when it contains at most 4,096 regular files, each at
  most 128 MiB, with at most 512 MiB total. Reject links and non-regular entries
  and remove rejected generations without following links.
- Retain at most eight recognized generation directories while preserving the
  current and visible successful generations.
- Keep renderer build logs at 2 MiB and PDF loads at 100 MiB.
- Store abnormal-shutdown recovery under Electron `userData`, keyed by opaque
  project ID and limited to 20 buffers, 2 MiB per buffer, and 10 MiB total.
- Offer recovered text for review and restore it only into dirty editor buffers.
  Project files change only through the existing explicit, version-checked save.
- Record bounded structured application events locally. Do not log source
  content by default. Rotate one 1 MiB prior log.
- Export support logs only after user action and redact user-home and active
  project paths where practical.
- Let the user clear recovery snapshots and application logs.
- Deny renderer-originated external navigation and popups because the current
  product has no external URL feature.
- Keep the local CSP restrictive and add dependency auditing to the Windows CI
  release gate.

## Alternatives considered

- Restore recovery directly to project files. Rejected because it can overwrite
  external edits and violates explicit review.
- Store recovery in renderer local storage. Rejected because source content
  needs a bounded, validated main-process store and user-controlled cleanup.
- Export raw native build logs automatically. Rejected because they may include
  source fragments, environment details, and local paths.
- Open validated `https` links externally. Deferred because no current feature
  requires external navigation; deny-all is the minimum capability.
- Delete every old build directory. Rejected because the currently displayed
  successful PDF must remain available after failure.

## Consequences

- The frozen preload bridge grows from seventeen to twenty-two narrow methods.
- Recovery is best effort and bounded; projects with more than 20 dirty buffers
  or more than 10 MiB of unsaved text are not fully recoverable.
- Accepted stored output is bounded, but a hostile TeX process may consume
  transient resources before timeout because no OS-level sandbox exists.
- Application logs improve local diagnosis while remaining intentionally less
  detailed than raw compiler logs.
- The current product has no renderer capability to open external URLs.

## Validation

- Unit and integration tests cover process/output limits, generation retention,
  links, oversized logs, strict recovery schemas, redaction, rotation, CSP,
  navigation, shell metacharacters, path traversal, and shell-escape policy.
- Electron E2E kills the first application process, reviews the stored snapshot,
  restores it to the editor, verifies disk remains unchanged, and writes only
  after explicit Save.
- Dependency audit, aggregate coverage, native MiKTeX recipes, and rendered PDF
  inspection are recorded in `docs/reports/SPRINT-10.md`.
