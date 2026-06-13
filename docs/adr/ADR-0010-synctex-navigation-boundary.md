# ADR-0010: SyncTeX navigation boundary

- Status: Accepted
- Date: 2026-06-14

## Context

Sprint 8 must connect source positions and PDF coordinates without exposing
canonical project or build paths to the untrusted renderer. SyncTeX can also
read `SYNCTEX_VIEWER` and `SYNCTEX_EDITOR`, which could otherwise turn a
navigation query into an external process launch.

## Decision

- Keep parsing and process invocation in `src/synctex/`, owned by the main
  process.
- Add two strict preload methods. Requests carry an opaque build identity plus
  relative source or numeric PDF coordinates.
- Resolve the identity only against the current successful PDF and its
  generation-isolated `.synctex.gz` file.
- Validate source paths through `ProjectService`; map inverse results only to
  files enumerated inside the project; return project-relative paths only.
- Invoke `synctex` with argument arrays, `shell: false`, the canonical project
  working directory, and a five-second timeout.
- Remove `SYNCTEX_VIEWER` and `SYNCTEX_EDITOR` from the child environment and
  never pass SyncTeX's command-execution option.
- Parse at most 512 KiB of result text and return generic errors that do not
  repeat child output or canonical paths.
- Treat missing, malformed, or stale data as non-fatal navigation failures.
- Indicate forward targets in the PDF and inverse targets in CodeMirror.

## Consequences

- The frozen bridge grows from nine to eleven narrow methods.
- Navigation is unavailable for retained or edited-source PDFs until a current
  successful build exists.
- Inverse search uses a PDF double-click and opens only validated project files.
- Total child-process capture remains a Sprint 10 hardening item.

## Validation

- Parser fixtures cover native Windows output, mixed separators, malformed
  records, unknown files, and bounds.
- Integration covers spaces in paths, argument arrays, environment stripping,
  timeout/failure mapping, missing data, stale builds, and multi-file results.
- Component and Electron E2E tests cover both visible targets and directions.
- Real MiKTeX/SyncTeX maps `chapters/intro.tex:2` to page 1 and back on a path
  containing spaces.
