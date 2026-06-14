# ADR-0011: Settings, toolchain readiness, and latexmk trust

- Status: Accepted
- Date: 2026-06-14
- Deciders: TeXPulse maintainers
- Related requirements: `FR-ENV-001` through `FR-ENV-008`, `FR-BUILD-009`,
  `FR-BUILD-013` through `FR-BUILD-015`, `FR-BUILD-018`, `FR-BUILD-019`,
  `FR-SET-001` through `FR-SET-006`, `FR-PACK-003`, and `FR-PACK-004`

## Context

Sprint 9 must make toolchain and build behavior configurable without moving
filesystem or process authority into the renderer. Global preferences and
project build choices have different ownership and migration lifecycles.
`latexmk` configuration files are executable Perl, so loading them cannot be an
implicit convenience. Cleanup must also avoid invoking project-controlled
configuration or deleting unknown output.

## Decision

- Store schema-versioned global settings in Electron's `userData` directory and
  project settings in `.texpulse/project.json`.
- Validate both stores strictly. Migrate known older schemas and otherwise
  restore safe defaults with a visible issue.
- Keep workspace local storage limited to view state; it no longer owns build or
  editor preferences.
- Use the global automatic-build value only as the default when project metadata
  is absent. Persist each project's override separately.
- Run the existing isolated doctor from the setup wizard. Report readiness only
  after a real self-test passes or the user explicitly skips it.
- Treat a custom executable directory as a user-selected trusted tool source.
  Resolve only fixed tool names from it and display detected paths and versions.
- Pass `-norc` by default. Omit it only after the project setting explicitly
  trusts `latexmk` configuration files, including `.latexmkrc`.
- Keep `-no-shell-escape` enabled regardless of `latexmk` configuration trust.
- Implement clean build as `latexmk -gg` in a new generation, retaining normal
  timeout, cancellation, and stale-result controls.
- Implement auxiliary cleanup in application code with an allowlist of known
  auxiliary suffixes. Restrict it to validated generation directories, skip
  links and junctions, preserve PDFs, logs, SyncTeX data, and unknown files, and
  never invoke `latexmk` cleanup hooks.
- Reject project-settings changes and cleanup while a build or maintenance
  operation could race with the same project session.

## Alternatives considered

- Store every preference in browser local storage. Rejected because it blurs
  application and project ownership and bypasses main-process persistence.
- Load `.latexmkrc` automatically. Rejected because configuration loading can
  execute Perl code.
- Use `latexmk -c` for auxiliary cleanup. Rejected because it may load project
  configuration and has a broader project-controlled deletion policy.
- Delete the whole build directory. Rejected because it would remove retained
  PDFs, logs, SyncTeX data, and unknown user-inspection artifacts.

## Consequences

- The frozen bridge grows from eleven to seventeen narrow methods.
- Project metadata advances to schema version 2 with `allowLatexmkRc`; version 1
  migrates with trust disabled.
- Global schema version 0 migrates to version 1. Invalid data is recoverable but
  may require the user to re-enter preferences.
- A skipped self-test is recorded explicitly and is not represented as a
  successful compile.
- Enabling project `latexmk` configuration or selecting a custom executable
  directory expands the trusted local input and must remain visible to users.
- Old generation retention and total output bounds remain Sprint 10 work.

## Validation

- Unit and integration tests cover schemas, migrations, defaults, persistence,
  recipes, `-norc`, clean arguments, cleanup allowlists, links, and busy races.
- Component and Electron E2E tests cover settings, first-run setup, honest
  readiness, recipe selection, clean builds, and cleanup.
- Conditional native tests compile pdfLaTeX, XeLaTeX, LuaLaTeX, BibTeX, and
  Biber fixtures with real MiKTeX and inspect the generated PDFs.
