# ADR-0013: Windows packaging and sample project

- Status: Accepted
- Date: 2026-06-14
- Deciders: TeXPulse maintainers
- Related requirements: `FR-PACK-001` through `FR-PACK-007`, `NFR-COMP-001`,
  `NFR-SEC-004`, `NFR-SEC-005`, `NFR-SEC-012`, and `AS-010`

## Context

Sprint 11 requires an installable Windows beta, packaged-path verification, a
first-run workflow, an editable sample, and uninstall behavior. The repository
previously ran only from its development tree, and the toolchain self-test
loaded a fixture through a development-relative path. The product must not
bundle MiKTeX, add updates, expose arbitrary filesystem capability, or weaken
the existing Electron boundary.

## Decision

- Package Windows x64 builds with pinned Electron Builder 26.15.3 and its NSIS
  target.
- Produce both an unpacked development package and an assisted per-user
  installer. Allow users to choose the installation directory.
- Keep ASAR enabled, package only production bundles and dependencies, and copy
  the fixed sample source as an external application resource.
- Resolve resources from the repository `resources` directory in development and
  from Electron `process.resourcesPath` after packaging.
- Use the bundled sample as the isolated doctor fixture. Copy it once into the
  application's user-data directory when the user selects `Open sample project`;
  preserve later edits and reject unsafe destination entries.
- Add one fixed, typed, sender-checked `openSampleProject` preload method. It
  accepts no renderer path or content.
- Preserve user data during uninstall. Remove application binaries, shortcuts,
  and installed resources while retaining settings, logs, recovery data, and the
  edited sample for a later reinstall.
- Do not bundle MiKTeX, Perl, an updater, analytics, or network services.
- Treat the Sprint 11 artifact as an unsigned beta. Code signing requires a
  separately provisioned certificate and release procedure.

## Alternatives considered

- Electron Forge was considered because Electron documents it as a full
  packaging workflow. Electron Builder was selected for this beta because one
  pinned development dependency provides the required NSIS installer, selectable
  destination, ASAR resources, metadata, and unpacked directory target with less
  project-specific configuration.
- A portable ZIP alone was rejected because it does not exercise installer,
  shortcut, uninstall, or clean-profile behavior.
- Copying the sample to an arbitrary renderer-provided path was rejected because
  it would expand filesystem authority. The application-owned sample location
  keeps the capability fixed and testable.
- Bundling MiKTeX was rejected because licensing, size, update ownership, and
  distribution policy require a separate decision.
- Automatic updates were rejected for the beta because they add network,
  signing, integrity, rollback, and privacy concerns outside Sprint 11.

## Consequences

- The frozen preload bridge grows from twenty-two to twenty-three fixed methods.
- Packaged and development resource layouts are explicit and covered by separate
  Electron tests.
- The installer is approximately 121 MB and requires a separately installed,
  configured MiKTeX plus native Windows Perl for compilation.
- The unsigned installer may trigger Windows SmartScreen or antivirus reputation
  warnings even though the local Defender scan found no detection.
- Application data survives uninstall by design. Users can clear recovery and
  logs in Settings; removing all preserved data remains an explicit manual
  action.
- Electron Builder is a development-only dependency covered by the frozen
  lockfile and dependency audit.

## Validation

- `pnpm package:dir` builds the unpacked Windows application.
- `pnpm package:win` generates the x64 NSIS installer.
- `pnpm test:packaged` installs into a path containing spaces, launches with a
  clean user-data directory, runs the real MiKTeX self-test, edits and compiles
  the sample, renders the PDF, captures a 150% scale screenshot, closes,
  reopens, verifies the edit, uninstalls, and confirms user data remains.
- Unit/integration and development Electron E2E tests cover sample-copy
  preservation, fixed sample IPC, development resources, and bridge shape.
- Release evidence records Authenticode status and Microsoft Defender scan
  results without representing an unsigned beta as a signed release.
