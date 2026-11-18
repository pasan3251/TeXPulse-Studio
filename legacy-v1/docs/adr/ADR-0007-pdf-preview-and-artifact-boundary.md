# ADR-0007: PDF Preview and Artifact Boundary

- Status: Accepted
- Date: 2026-06-13
- Deciders: TeXPulse maintainers
- Related requirements: `FR-BUILD-001`, `FR-BUILD-004` through `FR-BUILD-013`,
  `FR-BUILD-016`, `FR-BUILD-017`, `FR-PDF-001` through `FR-PDF-008`,
  `FR-DIAG-001`, `FR-DIAG-006`, `NFR-PERF-007`, `NFR-REL-001` through
  `NFR-REL-003`, `NFR-SEC-004` through `NFR-SEC-008`

## Context

Sprint 5 connects the untrusted renderer to manual compilation and completed PDF
output. The renderer needs build status, bounded log display, PDF bytes, and
explicit system open/reveal actions without receiving canonical project paths as
actionable values, arbitrary filesystem access, or a general process capability.
Raw compiler logs may still contain local path text. Failed and stale
generations must not replace the last successful preview.

PDF rendering requires a maintained browser implementation. The SRS selects
PDF.js, so `pdfjs-dist` version 6.0.227 is added as a pinned production
dependency. It is loaded only when a completed PDF exists.

## Decision

- Own one `ProjectService` and one `BuildController` in a main-process
  `ProjectSession`.
- Save modified renderer buffers before a manual compile and stop the build when
  a save fails or races with a newer edit.
- Return typed build state, bounded display log text, and opaque
  `{ buildId, generation }` artifact identity through validated IPC.
- Keep canonical artifact paths in the main process. Revalidate the active
  artifact token, canonical path, generation directory, file type, and 100 MiB
  preview limit before reading, opening, or revealing a PDF.
- Load PDF bytes only after the compiler has completed and reported a readable
  output.
- Preserve the previous successful PDF after failed, cancelled, timed-out, or
  stale builds and label whether the displayed artifact is current.
- Mark a loaded PDF as retained when source changes during or after its build.
- Lazy-load PDF.js and its dedicated worker under `worker-src 'self'`.
- Preserve viewer page, zoom mode, custom zoom, and approximate scroll position
  when a new PDF replaces the current document.
- Keep the complete compiler log on disk and cap only the renderer display copy
  at 2 MiB.
- Use Electron `shell.openPath` and `shell.showItemInFolder` only after artifact
  token and path revalidation.

## Alternatives considered

- Sending absolute PDF paths to the renderer was rejected because it would leak
  the project boundary and make renderer-controlled file operations easier to
  introduce.
- Loading a PDF from a `file:` URL was rejected because it would require broader
  renderer filesystem access and CSP allowances.
- Replacing the preview immediately when a build starts was rejected because it
  would visibly blank a valid result and make failures destructive.
- Embedding a native PDF viewer was rejected because PDF.js matches the SRS,
  remains local, and supports the required page and zoom controls.
- Loading PDF.js in the initial application bundle was rejected because the
  editor should not pay the viewer cost before a PDF exists.

## Consequences

- The preload grows from three to eight fixed methods but still exposes no raw
  IPC, path capabilities, process primitives, or filesystem primitives.
- The PDF.js viewer and worker add approximately 424 KiB and 1.25 MiB
  uncompressed production assets and are loaded on demand.
- Completed PDF bytes cross IPC and are bounded to 100 MiB.
- Raw compiler log text can disclose local paths to the renderer for
  troubleshooting, but it grants no corresponding file capability.
- The visible log is bounded, but compiler stdout/stderr capture and total build
  output remain pending Sprint 10 hardening.
- Source edits conservatively mark the preview as retained until a successful
  manual build completes.
- External open/reveal depends on Windows file associations and Explorer.

## Validation

- Unit tests cover retained/current state and stale renderer completions.
- Component tests cover PDF page, zoom, and scroll preservation on reload.
- Integration tests cover compile IPC, opaque artifact responses, PDF bytes,
  missing output, failed-build retention, invalid tokens, desktop action
  failures, and path-bound session behavior.
- Electron E2E covers edit, save, compile, PDF.js rendering, raw logs, and
  failed-build retention while asserting the isolated eight-method bridge.
- A real MiKTeX compile produced and visually inspected a one-page PDF with
  SyncTeX output.
