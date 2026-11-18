# ADR-0006: Secure Electron Shell and IPC

- Status: Accepted
- Date: 2026-06-13
- Deciders: TeXPulse maintainers
- Related requirements: `FR-PROJ-001`, `FR-PROJ-003`, `FR-EDIT-001` through
  `FR-EDIT-007`, `FR-SAVE-003`, `FR-SAVE-005`, `NFR-SEC-001` through
  `NFR-SEC-006`, `NFR-SEC-011`, `NFR-PRIV-001`, `NFR-PRIV-002`, `AS-009`

## Context

Sprint 4 introduces the first untrusted renderer. It needs enough capability to
select a project and edit text without receiving Node.js, arbitrary IPC,
absolute filesystem paths, network access, or compiler control. Sandboxed
Electron preloads have a restricted runtime and therefore need a single bundled
CommonJS entry.

## Decision

- Enable Electron sandboxing before app readiness.
- Create BrowserWindows with Node integration disabled, context isolation and
  web security enabled, no webview, and DevTools disabled outside explicit
  development mode.
- Deny permission requests, new windows, webviews, and unexpected navigation.
- Load only local bundled renderer assets under a restrictive CSP.
- Permit inline styles only because CodeMirror installs runtime style modules;
  continue to deny inline and evaluated scripts.
- Bundle the preload as one CommonJS file and expose a frozen API containing
  only `openProject`, `readTextFile`, and `writeTextFile`.
- Keep channel names separate from Zod schemas so the preload contains no schema
  runtime or project implementation.
- Validate the sending web contents, main frame, every request, and every
  response in the main process.
- Return only a project basename and project-relative paths to the renderer.
- Reject Node/Electron imports and common Node globals in renderer source at
  lint time.
- Keep all canonical path, link, UTF-8, size, atomic-write, and version-conflict
  enforcement inside `ProjectService`.

## Alternatives considered

- Exposing `ipcRenderer` was rejected because it would allow the renderer to
  invoke channels outside the intended capability set.
- Performing filesystem work in preload was rejected because it would expand the
  renderer-facing trust boundary and duplicate project validation.
- Disabling the sandbox to use an ESM preload was rejected because a bundled
  CommonJS preload preserves the stronger Electron boundary.
- Loading React, CodeMirror, fonts, or other assets from a CDN was rejected to
  preserve offline behavior and a local-only CSP.

## Consequences

- Renderer compromise does not directly grant Node.js or arbitrary filesystem
  access.
- New renderer capabilities require an explicit typed channel, validation,
  tests, and security review.
- The preload remains auditable and currently builds to 393 bytes.
- CodeMirror's runtime styles require a documented CSP style exception.
- The renderer cannot display or compile PDFs until later, separately reviewed
  capabilities are added.

## Validation

- Unit tests assert secure BrowserWindow options and production DevTools
  behavior.
- Integration tests reject untrusted frames, malformed payloads, path escapes,
  and unexpected arguments.
- Electron E2E asserts that renderer `require` and `process` are unavailable and
  that the bridge exposes exactly three methods.
- Interactive QA verifies real project opening, editing, Save All, conflict
  reporting, cursor/scroll restoration, and compact layout.
