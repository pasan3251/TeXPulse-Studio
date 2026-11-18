# ADR-0014: Project management and release provenance

- Status: Accepted
- Date: 2026-06-14
- Requirements: `FR-PROJ-002`, `FR-PROJ-004`, `FR-PROJ-007`, `FR-PROJ-012`,
  `NFR-SEC-004` through `NFR-SEC-006`, `NFR-UX-001`, `NFR-UX-003` through
  `NFR-UX-005`

## Context

The release candidate must close the remaining project-management requirements
without exposing renderer filesystem access or adding a production archive
dependency. It must also identify the exact source and Windows artifacts used
for release verification.

## Decision

- Select new-project and ZIP destinations in the Electron main process.
- Create only a missing destination from the fixed bundled `main.tex`.
- Expose fixed typed methods for project creation, mutation, recent lookup, and
  export; do not expose dialogs, absolute-path mutation, or raw filesystem APIs.
- Route every relative mutation through `ProjectService`, require the session to
  be idle, pause the watcher during mutation, and refresh the bounded project
  description before restarting it.
- Preserve version-token checks for externally editable files and remap the
  configured root when its file or containing folder moves.
- Require an explicit, keyboard-operable modal before deletion.
- Persist recent canonical paths only in application data and expose bounded
  opaque IDs to renderer actions.
- Implement classic stored ZIP output in a pure module using streaming file
  reads, CRC-32, data descriptors, central-directory records, and a temporary
  destination. Include regular project files only; skip links and exclude VCS,
  metadata, generated, dependency, coverage, and distribution directories.
- Pin the release to an annotated source tag. Generate a deterministic tagged
  source archive and record SHA-256, size, toolchain, application ASAR,
  installer, and Authenticode state in a local release manifest.

## Consequences

- The frozen preload bridge grows from twenty-three to thirty-one methods, each
  with strict request and response schemas and trusted-sender checks.
- ZIP export does not support ZIP64. The current project bounds are below the
  classic ZIP file-count and size limits; exceeding them fails explicitly.
- Stored ZIP entries favor deterministic, dependency-free behavior over
  compression. LaTeX source projects are expected to remain modest.
- Recent-project canonical paths remain main-process-only; the renderer receives
  opaque IDs and basename-only labels.
- The unsigned NSIS installer may not rebuild byte-for-byte because packaging
  metadata can contain timestamps. The tagged source archive and recorded
  artifact hashes are the release provenance controls.

## Rejected alternatives

- A renderer-provided absolute destination was rejected because it would widen
  the renderer filesystem capability.
- A general filesystem preload API was rejected because it violates the minimum
  capability boundary.
- Adding an archive package was rejected because the required stored ZIP subset
  is small, testable, and avoids new production supply-chain surface.
- Following links during export was rejected because it could include data
  outside the project.
- Unsandboxed hosted or multi-user compilation was rejected pending a separate
  SRS, threat model, and execution sandbox.
