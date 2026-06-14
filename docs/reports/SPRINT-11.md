# Sprint 11 Report

## 1. Sprint completed

Sprint 11: Packaging and first-run experience completed on 2026-06-14. Sprint 12
work was not started.

## 2. Requirement IDs implemented

- `FR-PACK-001` through `FR-PACK-007`
- `NFR-COMP-001` through `NFR-COMP-003`
- `NFR-REL-004` and `NFR-REL-005`
- `NFR-SEC-001`, `NFR-SEC-004` through `NFR-SEC-006`, and `NFR-SEC-012`
- `NFR-PRIV-001` and `NFR-PRIV-002`
- `NFR-MAINT-004` through `NFR-MAINT-006`
- `NFR-UX-001` and `NFR-UX-004`
- `AS-010`

## 3. Files changed

Sprint 11 adds or updates:

- pinned Electron Builder 26.15.3, beta metadata, x64 ASAR packaging, assisted
  per-user NSIS configuration, package commands, and placeholder icon assets;
- explicit development and packaged resource resolution;
- a fixed bundled LaTeX sample used by both the application doctor and sample
  onboarding;
- a link-aware sample-copy service that preserves prior edits;
- one no-argument validated sample-project IPC/preload method, bringing the
  frozen bridge to twenty-three methods;
- welcome-screen sample onboarding;
- unit/integration, development Electron E2E, and installed packaged lifecycle
  coverage;
- clean-profile, spaces-in-install-path, real MiKTeX, high-DPI, reopen,
  preserved-data, and uninstall verification;
- ADR-0013, release notes, and updated architecture, security, test,
  troubleshooting, status, traceability, contributor, agent, and user
  documentation; and
- this sprint report.

No production dependency was added. Electron Builder is development-only.

## 4. Design decisions

- Use Electron Builder's NSIS target for the first Windows x64 beta.
- Generate an assisted per-user installer that permits a custom destination.
- Keep ASAR enabled and place the fixed sample under `process.resourcesPath`.
- Keep MiKTeX and Perl external; do not bundle or silently install them.
- Copy the sample into Electron `userData` only when missing, preserve edits,
  and open it through the normal canonical `ProjectSession`.
- Expose no renderer-selected sample path or content.
- Preserve application data on uninstall.
- Add no updater, analytics, telemetry, or network service.
- Ship the beta unsigned and record that signing/reputation remain release work.

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
pdfinfo output/playwright/sprint-11-packaged-sample.pdf
pdftotext output/playwright/sprint-11-packaged-sample.pdf -
pdftoppm -png -f 1 -singlefile -r 144 <packaged PDF> <render prefix>
Get-AuthenticodeSignature <installer>
Get-FileHash -Algorithm SHA256 <installer>
MpCmdRun.exe -Scan -ScanType 3 -File <installer> -DisableRemediation
git diff --check
```

Focused integration, TypeScript, package metadata, screenshot, application-log,
resource-layout, and complete-diff inspection commands were also run.

## 6. Test results and counts

- Unit test files: 26 passed.
- Unit tests: 129 passed.
- Component test files: 6 passed.
- Component tests: 13 passed.
- Deterministic integration files: 15 passed and 1 conditional file skipped.
- Deterministic integration tests: 73 passed and 5 native tests skipped.
- Coverage run: 47 files passed, 1 conditional file skipped, 215 tests passed,
  and 5 native tests skipped.
- Aggregate coverage: 93.01% statements, 85.03% branches, 94.85% functions, and
  93.03% lines.
- Conditional native recipe file: 1 passed with 5 real MiKTeX tests.
- Development Electron E2E: 6 passed.
- Installed packaged lifecycle E2E: 1 passed.
- Formatting, linting, strict type checking, production build, aggregate gate,
  frozen install, unpacked package, NSIS installer, diff whitespace check, and
  dependency audit: passed.

The packaged lifecycle installed into `Installed App With Spaces`, redirected
Electron to an empty application profile, ran the real first-run self-test,
opened and edited the sample, saved, compiled, rendered the PDF, closed,
reopened, verified the edit, uninstalled, verified the executable was removed,
and confirmed application data remained.

## 7. Packaged MiKTeX/PDF evidence

`pnpm texpulse-doctor` reported ready after a real isolated pdfLaTeX self-test.
It used `latexmk` 4.88 with `-norc`, `-no-shell-escape`, and `-synctex=1`,
completed in 689 ms, and produced a 15,599-byte one-page PDF and SyncTeX data.

The conditional native suite passed pdfLaTeX, XeLaTeX, LuaLaTeX, BibTeX, and
Biber workflows.

The installed application compiled the edited bundled sample with the system
MiKTeX. The copied evidence PDF is 15,379 bytes, one A4 page, PDF 1.5, and
contains the text `Packaged Sprint 11 verification`. It was converted to PNG
with `pdftoppm` and visually inspected. Text and page number are legible with no
clipping, overlap, missing glyphs, or malformed rendering.

MiKTeX still warns that updates have not been checked.

## 8. Installer and visual evidence

The final installer is:

```text
TeXPulse Studio-Setup-0.1.0-beta.1-x64.exe
Bytes: 120959510
SHA-256: DDE4733C7A6AD3FD8914E3EEB5811FF1A17C5B49FF9190D2E6DCF2D98B580E75
Authenticode: NotSigned
```

Microsoft Defender completed a custom scan of the final installer and reported
zero matching detections. This observation is not a signing or future reputation
guarantee.

`output/playwright/sprint-11-packaged-high-dpi.png` captures the installed
application at a forced 150% device scale after the real sample build. It shows
the sample source, current-build state, rendered PDF, build success notice, and
named controls without clipping. The screenshot was visually inspected.

## 9. Development-only assumptions removed

The packaged test found and drove fixes for two assumptions:

- The real settings store returned an internal `source` field that strict IPC
  correctly rejected. Development E2E overrides had hidden the mismatch. The
  main process now returns only the documented `{settings, issues}` response.
- Development resources live under repository `resources/`, while packaged
  resources live directly under `process.resourcesPath`. The resolver now models
  both layouts explicitly.

The packaged doctor fixture, sample project, renderer/preload bundles,
production dependencies, user-data persistence, installation destination, and
uninstaller were all exercised outside the repository runtime.

## 10. Security review findings

- The installed renderer remains sandboxed with Node integration disabled,
  context isolation enabled, CSP active, and permissions/navigation denied.
- The bridge exposes exactly twenty-three fixed methods and no raw filesystem,
  process, updater, network, or `ipcRenderer` primitive.
- `openSampleProject` accepts no renderer payload and prepares only the fixed
  bundled regular file.
- Existing sample edits are never silently overwritten.
- The copied sample enters the same canonical project, version-token,
  compiler-timeout, shell-escape, output-bound, and stale-result controls as any
  opened project.
- MiKTeX, Perl, signing credentials, source projects, telemetry, and an updater
  are absent from the installer.
- `pnpm audit:dependencies` reports no known vulnerabilities at the configured
  high-severity gate.

## 11. Known limitations

- The beta is unsigned and may trigger Windows SmartScreen or antivirus
  reputation warnings.
- The automated clean-profile test uses an isolated Electron user-data directory
  on the supported Windows account. A separate fresh Windows account or VM
  remains Sprint 12 release-candidate evidence.
- TeX and explicitly trusted local tools run with the desktop user's
  permissions; TeXPulse is not an OS-level hostile-project sandbox.
- MiKTeX and Perl must be installed and maintained separately.
- MiKTeX reports that updates have not yet been checked.
- Application data and the edited sample are preserved on uninstall by design.
- Automatic updates, code signing, rollback, and cross-platform packages are
  deferred.
- pnpm reports an ignored `electron-winstaller` transitive lifecycle script. The
  selected NSIS package and lifecycle test complete without it.
- Electron Builder reports unused non-Windows optional canvas binaries while
  packaging; the browser PDF.js path works in the installed application.

## 12. Technical debt

- Provision a code-signing certificate and reproducible signing procedure.
- Validate SmartScreen/reputation behavior with signed release artifacts.
- Repeat the install workflow on a separate clean Windows account or VM.
- Add manual installer UI and shortcut verification to the release charter.
- Define update signing, integrity, rollback, and privacy before adding updates.
- Replace placeholder application artwork before a stable public release.

## 13. Suggested commit message

```text
feat: package Sprint 11 Windows beta
```

## 14. Exact next sprint

Sprint 12: Release-candidate hardening. Do not begin it without explicit
approval.
