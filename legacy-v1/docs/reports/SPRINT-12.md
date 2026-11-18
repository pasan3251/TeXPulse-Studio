# Sprint 12 Report

## 1. Sprint completed

Sprint 12: Release-candidate hardening completed on 2026-06-14. Sprint 13 work
was not started.

## 2. Requirement IDs implemented

- `FR-PROJ-002`, `FR-PROJ-004`, `FR-PROJ-007`, and `FR-PROJ-012`
- `FR-SET-006` and `FR-PACK-006`
- `NFR-PERF-002`, `NFR-PERF-004`, and `NFR-PERF-005`
- `NFR-REL-005`
- `NFR-SEC-001`, `NFR-SEC-004` through `NFR-SEC-006`, `NFR-SEC-012`, and
  `NFR-SEC-013`
- `NFR-COMP-005`
- `NFR-MAINT-004` through `NFR-MAINT-006`
- `NFR-UX-001`, `NFR-UX-003` through `NFR-UX-005`
- `NFR-PRIV-001`, `NFR-PRIV-002`, and `AS-010`

The traceability gate confirms that all 145 unique SRS requirement and
acceptance-scenario IDs appear in `docs/REQUIREMENTS_TRACEABILITY.md`.

## 3. Files changed

Sprint 12 adds or updates:

- fixed-template project creation, project file/folder mutation, configured-root
  remapping, recent-project reopening, and source-only ZIP export;
- eight strictly validated project/recent/export preload methods, bringing the
  frozen bridge to thirty-one methods;
- keyboard-operable project dialogs, confirmed deletion, explorer actions,
  recent projects, state remapping, and high-DPI PDF control wrapping;
- 1,000-file, editor-input, and repeated-build memory gates;
- image, spaces-in-path, and no-PDF fixtures plus expanded unit, component,
  integration, native, Electron, and installed tests;
- release-candidate versioning, tagged provenance tooling, checklist, deferred
  issue register, ADR-0014, release notes, and updated user, contributor,
  architecture, security, test, threat-model, troubleshooting, status, and
  traceability documentation; and
- this sprint report.

No production dependency was added.

## 4. Design decisions

- Select project and ZIP destinations in the Electron main process.
- Copy only the fixed bundled `main.tex` into a missing new-project directory.
- Keep canonical recent-project paths in application data and expose only
  bounded opaque IDs plus basename labels to the renderer.
- Route mutations through `ProjectService`, require an idle build, pause the
  watcher, preserve file version checks, refresh the bounded project
  description, and restart the watcher.
- Require an explicit keyboard-operable modal before destructive deletion.
- Stream regular source files into a dependency-free classic stored ZIP, skip
  links, exclude generated/dependency/VCS data, and replace through a temporary
  file.
- Identify the release with an annotated tag and a manifest containing tagged
  source, installer, ASAR, signature state, toolchain, size, and SHA-256 data.

## 5. Commands run

```text
pnpm install --frozen-lockfile
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:component
pnpm test:integration
pnpm test:performance
pnpm test:coverage
pnpm test:e2e
pnpm build
pnpm check
pnpm audit:dependencies
pnpm texpulse-doctor
$env:TEXPULSE_RUN_NATIVE='1'; pnpm exec vitest run tests/integration/native-recipes.test.ts
pnpm package:dir
pnpm package:win
pnpm test:packaged
pnpm release:manifest
pdfinfo output/playwright/sprint-12-packaged-sample.pdf
pdftotext output/playwright/sprint-12-packaged-sample.pdf -
pdftoppm -png -f 1 -singlefile -r 144 <PDF> <render prefix>
Get-AuthenticodeSignature <installer>
Get-FileHash -Algorithm SHA256 <installer, ASAR, and PDF>
MpCmdRun.exe -Scan -ScanType 3 -File <installer> -DisableRemediation
git diff --check
```

Focused tests, PowerShell syntax checks, artifact inspection, screenshot review,
requirement review, and complete-diff inspection were also run.

## 6. Test results and counts

- Unit: 27 files and 132 tests passed.
- Component: 7 files and 18 tests passed.
- Deterministic integration: 16 files passed, 1 conditional file skipped, 82
  tests passed, and 7 native tests skipped.
- Performance: 1 file and 3 tests passed.
- Coverage: 50 files passed, 1 conditional file skipped, 232 tests passed, and 7
  native tests skipped.
- Coverage totals: 93.54% statements, 85.16% branches, 95.34% functions, and
  93.56% lines.
- Development Electron E2E: 7 passed.
- Conditional native recipe suite: 7 real MiKTeX tests passed.
- Installed packaged lifecycle: 2 passed.
- Frozen install, formatting, lint, strict type checking, production build,
  aggregate check, dependency audit, unpacked package, NSIS installer, and diff
  whitespace check: passed.

Reference-host performance observations:

- 1,000-file enumeration: 77 ms.
- Renderer hierarchy construction: 1.23 ms.
- Editor reducer input p95: 0.001 ms; maximum: 0.274 ms.
- Repeated-build observation: 500 completed builds and zero measured retained
  heap after explicit garbage collection.

## 7. Real MiKTeX/PDF evidence

The native doctor reported ready after a real isolated pdfLaTeX self-test using
`latexmk` 4.88 with `-norc`, `-no-shell-escape`, and `-synctex=1`. It completed
in 702 ms and produced a 15,599-byte one-page PDF.

The native recipe suite passed pdfLaTeX, XeLaTeX, LuaLaTeX, BibTeX, Biber,
image-asset, and spaces-in-path projects. The image fixture produced a
17,471-byte one-page PDF; the rendered image and text were visually inspected.
The spaces fixture produced a 15,995-byte one-page PDF.

The installed application produced
`output/playwright/sprint-12-packaged-sample.pdf`: 15,324 bytes, one A4 page,
PDF 1.5, with the text `Packaged release-candidate verification`.

```text
PDF SHA-256:
B92D3A0A84CB9633A821AC490A90DBF87AFDFBC403F9066592D406F2CF278B67
```

The PDF was rendered and inspected. Text and page number are legible with no
clipping, overlap, missing glyphs, or malformed rendering.

## 8. Screenshot and installer evidence

`output/playwright/sprint-12-project-release-candidate.png` shows the completed
project creation, file-management, selection, and export workflow.
`output/playwright/sprint-12-packaged-high-dpi.png` shows the installed
application at forced high DPI with the real PDF and all PDF controls visible.
Both screenshots were visually inspected.

The final installer and application archive are:

```text
TeXPulse Studio-Setup-0.1.0-rc.1-x64.exe
Bytes: 121154865
SHA-256: 4CC9F477FA7E0110F3BAB2FCF52CE14F960511EFF052C046AC3010460245026A
Authenticode: NotSigned

app.asar bytes: 77918578
app.asar SHA-256:
5D7D75FC24C2B4F93A4DBFBE353ED0053055724DA4B6D0F5572E5FF47E987DFE
```

Microsoft Defender completed a custom scan of the installer with no matching
detection. This does not substitute for code signing or future reputation.

## 9. Security review findings

- The complete diff was reviewed against the SRS for path escape, file loss,
  stale results, races, process leaks, and renderer privilege expansion.
- Review caught and repaired canonical recent-project paths crossing into the
  renderer; the final renderer receives opaque IDs and basename-only labels.
- Review caught and repaired high-DPI PDF control overflow.
- The renderer remains sandboxed with Node integration disabled, context
  isolation enabled, CSP active, navigation denied, and thirty-one fixed
  validated preload methods.
- Project mutations retain canonical path/link checks and version tokens for
  externally editable open files. Builds and maintenance serialize mutation and
  export.
- ZIP export skips links and excludes metadata, generated, dependency, coverage,
  distribution, and VCS directories.
- No production dependency, updater, telemetry, analytics, remote compiler, or
  multi-user execution path was added.
- The dependency audit reports no known vulnerability at the configured
  high-severity gate.

No unresolved Sprint 12 blocker remains.

## 10. Known limitations

- The release candidate is unsigned and may trigger SmartScreen or antivirus
  reputation warnings.
- TeX and explicitly trusted tools execute with the desktop user's permissions;
  this is not an OS-level hostile-project sandbox.
- MiKTeX and native Windows Perl are separate prerequisites. MiKTeX reports that
  updates have not yet been checked, and MakeIndex exposes no parseable version.
- The classic ZIP writer does not support ZIP64 or compression.
- NSIS build metadata may vary across rebuilds. The deterministic tagged source
  archive and canonical artifact hashes are the provenance controls; a
  byte-identical installer rebuild is not claimed.
- Automatic updates, TeX Live implementation, external-file merge, and
  cross-platform packages remain deferred.
- The installed suite used isolated clean and previous-beta application profiles
  on the supported host, not a separate Windows account or VM.

## 11. Technical debt

- Provision a code-signing certificate and controlled signing procedure.
- Validate SmartScreen publisher reputation with signed artifacts.
- Repeat installed validation on additional clean Windows accounts or VMs.
- Add ZIP64/compression only when project bounds justify the extra complexity.
- Design update integrity, rollback, and privacy before adding an updater.
- Replace placeholder application artwork before a stable public release.

## 12. Suggested commit message

```text
feat: harden Sprint 12 release candidate
```

## 13. Exact next sprint

Sprint 13: Templates, local history, and Git awareness is optional post-release
work. Do not begin Sprint 13 without explicit approval.
