# Release Notes

## 0.1.0-rc.1

TeXPulse Studio 0.1.0-rc.1 is the first complete Windows 11 x64 release
candidate.

### Added since beta.1

- Create a project from the bundled minimal template.
- Create folders and text files, rename or move entries, and delete only after
  explicit confirmation.
- Reopen bounded recent projects through opaque application IDs.
- Export source-only ZIP archives that skip links, project metadata, generated
  output, dependencies, coverage, distribution, and VCS data.
- Preserve the configured root file when its containing folder is renamed.
- Release performance gates for 1,000-file projects, editor input, and repeated
  build memory.
- Previous-beta settings verification in the installed application.
- Tagged source, installer, packaged application, signature-state, and toolchain
  provenance manifest.

### Verification

The release candidate is exercised through deterministic unit, component,
integration, performance, coverage, Electron E2E, native MiKTeX, unpacked
package, NSIS install, real compile/PDF preview, reopen, upgrade-profile, and
uninstall checks. See `RELEASE_CANDIDATE_CHECKLIST.md` and
`reports/SPRINT-12.md`.

### Known release-candidate limitations

- The installer is unsigned and may trigger Windows SmartScreen or antivirus
  reputation warnings.
- MiKTeX and native Windows Perl remain separate prerequisites.
- TeX executes with the desktop user's permissions and is intended for trusted
  local projects.
- Automatic updates, TeX Live implementation, collaboration, and multi-user
  compilation are not included.

## 0.1.0-beta.1

TeXPulse Studio 0.1.0-beta.1 is the first installable Windows 11 x64 beta.

### Included

- Assisted per-user Windows installer and unpacked development package.
- Sandboxed Electron editor with local MiKTeX compilation and PDF.js preview.
- First-run toolchain setup with a real isolated compile self-test.
- Editable bundled sample project available from the welcome screen.
- Autosave, newest-only live builds, structured diagnostics, SyncTeX navigation,
  settings, clean builds, recovery, and local support logs.
- Installer, clean-profile, spaced-path, high-DPI, reopen, and uninstall test
  coverage.

### Required separately

- Windows 11 x64.
- MiKTeX with `latexmk`.
- Native Windows Perl on `PATH`.

MiKTeX and Perl are not bundled. TeXPulse Studio has no automatic updater,
analytics, telemetry, or network service.

### Beta limitations

- The installer is unsigned and may trigger Windows SmartScreen or antivirus
  reputation warnings. Verify the artifact source before running it.
- TeX runs with the desktop user's permissions and is intended for trusted local
  projects.
- Application settings, logs, recovery data, and the editable sample are
  preserved during uninstall.
- MiKTeX package availability and update state remain the user's responsibility.
