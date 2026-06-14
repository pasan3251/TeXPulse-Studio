# TeXPulse Studio 0.1.0-rc.1

**TeXPulse Studio 0.1.0-rc.1** is the first complete Windows release candidate
for TeXPulse Studio: an offline, local-first LaTeX editor for Windows with
secure Electron isolation, MiKTeX compilation, PDF preview, SyncTeX navigation,
diagnostics, project management, recovery, packaging, and release validation.

- Tag: `v0.1.0-rc.1`
- Validated commit: `b4057fd`
- Platform: Windows 11 x64
- License: MIT

## Screenshots

### Editor, PDF preview, and real MiKTeX build

![TeXPulse Studio packaged high-DPI PDF preview](https://raw.githubusercontent.com/pasan3251/TeXPulse-Studio/main/docs/images/texpulse-packaged-high-dpi.png)

### Project creation, file management, and ZIP export

![TeXPulse Studio project workflow](https://raw.githubusercontent.com/pasan3251/TeXPulse-Studio/main/docs/images/texpulse-project-workflow.png)

### Rendered PDF evidence

![Packaged release candidate PDF output](https://raw.githubusercontent.com/pasan3251/TeXPulse-Studio/main/docs/images/texpulse-packaged-pdf.png)

## Highlights

- Create a project from the bundled minimal template.
- Open existing local projects.
- Create, rename, move, and delete project files and folders.
- Confirm destructive file actions before deletion.
- Remember and reopen recent projects.
- Export source-only ZIP archives without build artifacts.
- Edit LaTeX with CodeMirror.
- Save, autosave, and live-build with debounce controls.
- Compile locally through MiKTeX `latexmk`.
- Preview generated PDFs with PDF.js.
- Retain the last successful PDF when a later build fails.
- Show structured diagnostics with source navigation.
- Support SyncTeX forward and inverse navigation.
- Preserve unsaved recovery data after abnormal shutdown.
- Package as a Windows NSIS installer.

## Security and Privacy

- No telemetry, analytics, cloud compilation, updater service, or bundled TeX
  distribution.
- Renderer sandbox enabled.
- Electron `nodeIntegration` disabled.
- Electron `contextIsolation` enabled.
- Strict typed preload API.
- Project paths are validated and canonicalized.
- TeX shell escape is disabled by default.
- Project ZIP export skips links, build output, metadata, dependencies,
  coverage, distribution, and VCS folders.

## Requirements

- Windows 11 x64
- MiKTeX with `latexmk`
- Native Windows Perl on `PATH`

MiKTeX and Perl are not bundled.

## Release Assets

Recommended files for the GitHub release:

- `TeXPulse-Studio-Setup-0.1.0-rc.1-x64.exe`
- `release-manifest.json`
- `v0.1.0-rc.1-source.zip`

## Artifact Verification

Installer:

```text
TeXPulse Studio-Setup-0.1.0-rc.1-x64.exe
SHA-256: 4CC9F477FA7E0110F3BAB2FCF52CE14F960511EFF052C046AC3010460245026A
Authenticode: NotSigned
```

Application archive:

```text
app.asar SHA-256:
5D7D75FC24C2B4F93A4DBFBE353ED0053055724DA4B6D0F5572E5FF47E987DFE
```

Tagged source archive:

```text
v0.1.0-rc.1-source.zip
SHA-256: 115055D6B83FC447A6331F0CFA55850D1DAD8282BD2C5BA92766DFF3855CDF3E
```

## Validation Summary

The release candidate passed frozen install, formatting, lint, strict
TypeScript, unit tests, component tests, integration tests, performance tests,
coverage, Electron E2E tests, native MiKTeX tests, Windows package build,
installed packaged lifecycle tests, previous-beta settings preservation, PDF
inspection, screenshot inspection, Microsoft Defender custom scan, and release
provenance manifest generation.

## Known Limitations

- The installer is unsigned and may trigger Windows SmartScreen or antivirus
  reputation warnings.
- TeX executes with the current Windows user's permissions; TeXPulse Studio is
  intended for trusted local projects.
- MiKTeX and Perl must be installed separately.
- Automatic updates are not included.
- TeX Live support is architecturally possible but not implemented in this
  release.
- ZIP export does not support ZIP64 or compression.
- Collaboration and multi-user compilation are intentionally not included.
