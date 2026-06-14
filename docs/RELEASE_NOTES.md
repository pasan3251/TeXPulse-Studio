# Release Notes

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
