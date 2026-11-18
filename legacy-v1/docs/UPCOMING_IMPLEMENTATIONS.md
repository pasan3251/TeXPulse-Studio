# Upcoming Implementations

This document records planned and deferred work after `0.1.0-rc.1`. It does not
replace `docs/SRS.md`; the SRS remains the authoritative product specification.
Items below must be implemented one sprint at a time, with requirement IDs,
tests, updated traceability, and a sprint report.

## Current Baseline

TeXPulse Studio currently provides an offline Windows release candidate with a
secure Electron editor, local MiKTeX compilation through `latexmk`, autosave,
debounced live build, PDF.js preview, SyncTeX navigation, structured
diagnostics, recovery, project management, source-only ZIP export, read-only Git
status, packaging, and release evidence.

The current version remains intentionally local-first:

- no telemetry;
- no hosted backend;
- no cloud storage;
- no collaboration runtime;
- no automatic updates;
- no bundled MiKTeX or Perl;
- no general terminal;
- no default TeX shell escape.

## Implementation Principles

- Keep `docs/SRS.md` authoritative.
- Add one vertical slice per sprint.
- Keep Electron `nodeIntegration` disabled and `contextIsolation` enabled.
- Expose only typed, schema-validated preload methods.
- Keep compiler execution shell-free with executable plus argument arrays.
- Preserve generation isolation, newest-result checks, timeout, cancellation,
  output bounds, and retained-PDF behavior.
- Do not add production dependencies unless the sprint report explains why.
- Do not weaken tests; prefer stable observable outcomes over arbitrary waits.

## Candidate Sprint 16: Release Signing And Installer Trust

**Status:** Deferred release operation.

**Source:** `docs/DEFERRED_ISSUES.md`, `FR-PACK-001`, `FR-PACK-006`,
`NFR-SEC-012`.

**Goal:** Reduce Windows reputation friction and improve public distribution
trust.

**Planned work:**

- Acquire and configure an Authenticode code-signing certificate.
- Sign the NSIS installer and packaged application binaries.
- Record signing thumbprints and verification instructions in release docs.
- Update release manifest generation to include signature status.
- Document SmartScreen behavior before and after signing.

**Acceptance checks:**

- `pnpm package:win`
- signature verification with Windows tooling;
- `pnpm release:manifest`
- installed smoke test on a clean Windows profile.

## Candidate Sprint 17: Automatic Updates

**Status:** Deferred by `FR-PACK-007`.

**Goal:** Provide a safe updater after signing and release provenance are in
place.

**Planned work:**

- Select an update channel and transport through an ADR.
- Require signed update artifacts.
- Add update check UI that is explicit and non-disruptive.
- Add rollback and failed-update documentation.
- Keep update telemetry opt-in or absent.

**Security concerns:**

- signed metadata;
- downgrade prevention;
- replay protection;
- no silent source-file changes.

## Candidate Sprint 18: External Change Compare And Merge

**Status:** Deferred enhancement.

**Source:** `FR-PROJ-008`, `FR-PROJ-011`, `FR-SAVE-005`.

**Goal:** Improve external-editor workflows while preserving the current
no-silent-overwrite guarantee.

**Planned work:**

- Add side-by-side comparison for externally changed files.
- Let the user keep editor content, accept external content, or save a merged
  result.
- Show clear version-token conflict explanations.
- Keep automatic reload disabled for dirty buffers unless explicitly accepted.

**Tests:**

- external modification conflict unit/integration tests;
- E2E conflict review workflow;
- recovery interaction tests.

## Candidate Sprint 19: Local Revision History And Diff View

**Status:** Deferred optional feature.

**Source:** SRS section 10.12 and Sprint 13 notes.

**Goal:** Give users a local safety net without cloud storage.

**Planned work:**

- Store bounded local snapshots under application data or `.texpulse` after a
  privacy review.
- Add a diff view for current file versus snapshot.
- Add restore-to-editor, not restore-to-disk, until the user confirms.
- Apply strict size and retention limits.

**Risks:**

- source content retention must be transparent;
- support-log export must not leak snapshots;
- snapshot corruption must not affect source files.

## Candidate Sprint 20: Template Library

**Status:** Deferred optional feature.

**Goal:** Extend the fixed minimal starter into several local templates.

**Planned work:**

- Add article, report, thesis, Beamer, and bibliography templates.
- Keep templates bundled, inspectable, and offline.
- Let users create projects from selected templates.
- Add template metadata and preview text.

**Tests:**

- each template compiles with the real toolchain when prerequisites exist;
- project creation E2E;
- ZIP export excludes generated artifacts.

## Candidate Sprint 21: Git Diff And Commit Assistance

**Status:** Deferred optional feature.

**Source:** Sprint 13 implemented read-only status only.

**Goal:** Help users understand repository state without becoming a full Git
client.

**Planned work:**

- Add read-only file-level summaries behind strict bounds.
- Add a local diff viewer.
- Consider commit assistance only after a separate safety review.
- Never push, pull, or rewrite history without explicit user action.

**Security constraints:**

- renderer should not receive arbitrary path lists beyond bounded summaries;
- Git commands must use argument arrays and project root validation;
- no credential handling in the renderer.

## Candidate Sprint 22: PDF Viewer Virtualization

**Status:** Technical debt from Sprint 15.

**Goal:** Improve performance on very large PDFs.

**Planned work:**

- Render only visible or near-visible pages.
- Preserve page number, zoom, scroll position, and SyncTeX target behavior.
- Keep last-successful PDF retention.
- Add large-document performance tests.

**Acceptance checks:**

- component tests for virtualization boundaries;
- E2E scroll and SyncTeX workflow;
- repeated PDF refresh memory observation.

## Candidate Sprint 23: TeX Live Adapter

**Status:** Deferred under `NFR-COMP-005`.

**Goal:** Add another compiler backend without disturbing the MiKTeX path.

**Planned work:**

- Implement a `CompilerAdapter` for TeX Live.
- Extend toolchain discovery with TeX Live-specific paths and version parsing.
- Reuse root validation, output bounds, generation handling, and diagnostics.
- Add conditional native tests.

**Exit criteria:**

- MiKTeX behavior remains unchanged;
- adapter selection is explicit;
- tests cover missing-tool and path-with-spaces cases.

## Candidate Sprint 24: Tectonic Adapter

**Status:** Deferred optional adapter.

**Goal:** Explore a simpler compiler path for projects compatible with Tectonic.

**Planned work:**

- Record an ADR for Tectonic behavior and package-fetching implications.
- Add a compiler adapter behind the existing interface.
- Expose Tectonic as an explicit recipe only when available.
- Document differences from `latexmk`.

## Candidate Sprint 25: Linux And macOS Packaging

**Status:** Deferred by initial Windows scope.

**Goal:** Make the local-first editor portable after the Windows release is
stable.

**Planned work:**

- Add platform ADRs for paths, packaging, file watching, and TeX discovery.
- Validate TeX Live as the likely default distribution outside Windows.
- Add platform-specific CI where feasible.
- Keep Windows behavior stable.

## Candidate Sprint 26: Collaboration Runtime

**Status:** Deferred after Sprint 14 research controls.

**Source:** `docs/COLLABORATION_SRS.md`, `docs/COLLABORATION_THREAT_MODEL.md`,
and ADR-0015.

**Goal:** Prototype collaboration without compromising the stable offline path.

**Planned work:**

- Keep collaboration behind a feature flag.
- Use the researched local-network WebSocket plus Yjs direction only after a
  sprint plan is approved.
- Keep host authority over files and compilation.
- Validate every remote message with strict schemas.
- Never allow guest input to become a host filesystem path without
  `ProjectService` validation.

**Non-goals:**

- hosted build workers;
- anonymous public sharing;
- remote shell or compiler access;
- cloud project storage.

## Candidate Sprint 27: Stronger TeX Sandboxing Research

**Status:** Accepted residual risk for the release candidate.

**Goal:** Reduce risk from hostile local TeX projects beyond current timeout,
shell-escape, and output-bound controls.

**Possible directions:**

- Windows job object limits;
- temporary low-privilege execution accounts;
- container or VM-based execution;
- explicit trusted-project prompts;
- tighter generated-file monitoring during compilation.

This requires a separate threat model update before implementation.

## Candidate Sprint 28: Import ZIP

**Status:** SRS-adjacent enhancement.

**Goal:** Complement source-only export with safe import.

**Planned work:**

- Validate ZIP entry paths before extraction.
- Reject absolute paths, `..`, links, and oversized archives.
- Extract into a new project directory only.
- Add import summary and failure recovery.

## Candidate Sprint 29: Polish, Accessibility, And Branding

**Status:** Ongoing release polish.

**Planned work:**

- Replace placeholder artwork with final branded assets.
- Expand keyboard navigation checks.
- Add theme polish and high-contrast review.
- Document trademark and naming review before public promotion.

## Cross-Cutting Test Expectations

Every future sprint should run the applicable subset of:

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:component
pnpm test:integration
pnpm test:performance
pnpm test:coverage
pnpm test:e2e
pnpm audit:dependencies
pnpm build
```

Packaging or release work should additionally run:

```powershell
pnpm package:dir
pnpm package:win
pnpm test:packaged
pnpm release:manifest
```

Real LaTeX success may be claimed only when MiKTeX or the selected real TeX
distribution produced a PDF and that PDF was inspected.
