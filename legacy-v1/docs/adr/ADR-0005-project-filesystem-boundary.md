# ADR-0005: Project Filesystem Boundary

- Status: Accepted
- Date: 2026-06-13
- Deciders: TeXPulse maintainers
- Related requirements: `FR-PROJ-001`, `FR-PROJ-008` through `FR-PROJ-011`,
  `FR-SAVE-002` through `FR-SAVE-005`, `NFR-REL-004`, `NFR-SEC-006`, `AS-009`

## Context

The future renderer must not gain arbitrary filesystem access through project
operations. Project folders can contain traversal paths, symbolic links,
junctions, generated output, externally modified files, and malformed metadata.
Windows replacement behavior and Unicode paths must remain predictable before
the Electron bridge is introduced.

## Decision

- Canonicalize the selected project root with `realpath`.
- Accept only normalized relative entry paths and verify every resolved path is
  below the canonical root.
- Inspect existing path components with `lstat`.
- Report internal symbolic links and junctions during enumeration, but never
  traverse or mutate through them.
- Ignore known generated/dependency directories and the validated configured
  build directory.
- Treat editor files as valid UTF-8 text bounded to 10 MiB.
- Return a SHA-256 version token with every text read.
- Require the expected version token before replacing a file and return an
  explicit conflict when it differs.
- Save through a same-directory temporary file, sync it, and rename it over the
  destination. Create-only writes use a hard link to avoid overwriting an entry
  created concurrently.
- Store project settings in schema-versioned `.texpulse/project.json`.
- Store recent projects separately at an injected application-data path.

## Alternatives considered

- Following links whose final target remains inside the project was rejected
  because junction behavior and concurrent retargeting make the renderer-facing
  contract harder to reason about.
- Watching files with a new production dependency was deferred because version
  checks provide the required service-level conflict guarantee; live UI
  notifications belong with Electron/editor integration.
- Direct in-place writes were rejected because a crash could leave a partially
  written source file.

## Consequences

- Project operations have a conservative, testable boundary.
- External edits cannot be silently replaced when callers retain the latest
  version token.
- Legitimate projects that intentionally use internal links must access their
  real target paths instead.
- The service reports a flat typed entry list; Sprint 4 will render it as a
  hierarchy and provide conflict notices.
- Same-user concurrent filesystem races cannot be eliminated entirely with
  path-based Node APIs and remain part of the later threat-model review.

## Validation

- Unit tests cover traversal rejection, canonical roots, links/junctions,
  metadata validation, and deterministic root ranking.
- Integration tests cover CRUD, spaces and Unicode, ignored build output, atomic
  persistence, external change/deletion conflicts, and read-only files.
