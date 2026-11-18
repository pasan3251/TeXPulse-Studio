# Sprint 0 Report

## 1. Sprint completed

Sprint 0: Repository, requirements, and engineering controls completed on
2026-06-13. No compiler, Electron editor, or PDF viewer was implemented.

## 2. Requirement IDs implemented

- SRS §16 Sprint 0
- `NFR-MAINT-001`
- `NFR-MAINT-004`
- `NFR-MAINT-005`
- `NFR-MAINT-006`
- `NFR-COMP-001` baseline
- SRS §14.4 for the current scope
- SRS §20

`NFR-SEC-012` and `FR-PACK-006` received Sprint 0 foundations but remain ongoing
release requirements.

## 3. Files changed

The final foundation contains 34 repository files:

- Workspace and quality controls: `package.json`, lockfile, pnpm workspace,
  TypeScript, ESLint, Prettier, Git, and EditorConfig files.
- CI: `.github/workflows/ci.yml`.
- Tests and health marker: `src/health.ts`, `tests/unit/`, and
  `scripts/no-tests-yet.mjs`.
- Governing files: `AGENTS.md`, `README.md`, `CONTRIBUTING.md`, `docs/SRS.md`,
  and `docs/CODEX_MASTER_PROMPT.md`.
- Required architecture, test, security, troubleshooting, status, traceability,
  ADR, and report documents.

The four root handoff artifacts were migrated into canonical repository files
and removed after the SRS and master prompt copies were verified byte-for-byte.

## 4. Design decisions

- Use native Windows Node.js, pnpm, Electron, and MiKTeX tooling; do not mix WSL
  and Windows process paths.
- Select Electron, React, strict TypeScript, Vite, CodeMirror 6, and PDF.js for
  later product sprints without installing product dependencies in Sprint 0.
- Pin pnpm `10.12.1`, use exact development dependency versions, and permit only
  the required `esbuild` dependency lifecycle script.
- Keep integration and E2E commands executable but explicit that no relevant
  product surface exists yet.
- Override transitive `esbuild` to patched version `0.28.1` until Vite widens
  its dependency range.

## 5. Commands run

```text
pnpm install
pnpm install --frozen-lockfile
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm check
pnpm audit
git diff --check
```

The finished tree was also installed and checked from a separate clean temporary
Git clone using the frozen lockfile.

## 6. Test results and counts

- Unit test files: 3 passed.
- Unit tests: 5 passed.
- Integration: no applicable product surface; status command passed.
- E2E: no applicable product surface; status command passed.
- Build: passed.
- Formatting, linting, and strict type checking: passed.
- Clean-clone frozen install and complete gate: passed.
- Dependency audit: no known vulnerabilities.
- CI workflow: valid YAML, Windows runner and required commands asserted by unit
  test. The hosted GitHub Actions job was not executed locally.

## 7. Real MiKTeX/PDF evidence

Not applicable to Sprint 0. MiKTeX 25.12, TeX engines, and SyncTeX are
discoverable, but `latexmk` cannot run because Perl is missing. No real compile
or PDF claim was made.

## 8. Screenshot evidence

Not applicable because Sprint 0 contains no UI.

## 9. Security review findings

- No product runtime, renderer privilege, compiler process, or filesystem API
  was introduced.
- Dependency lifecycle scripts are denied except for `esbuild`.
- Initial critical/high dependency advisories were repaired.
- Final `pnpm audit` reports no known vulnerabilities.
- Electron, IPC, path, shell-escape, timeout, cancellation, and stale-result
  constraints are documented for later enforcement.

## 10. Known limitations

- `latexmk` is blocked by the missing native Windows Perl interpreter.
- MiKTeX reports that updates have not yet been checked.
- Hosted GitHub Actions execution is not available from this local run.
- There are no integration, E2E, packaging, compiler, PDF, or UI tests yet
  because their product surfaces are outside Sprint 0.
- Newly installed Codex skills require a Codex restart before use.

## 11. Technical debt

- Remove the `esbuild 0.28.1` pnpm override after Vite accepts a patched range.
- Consider pinning GitHub Actions to immutable commit SHAs during security
  hardening.
- Create the repository-scoped `texpulse-sprint` skill only after the workflow
  is proven in Sprint 1 or Sprint 2.

## 12. Suggested commit message

```text
chore: establish Sprint 0 engineering controls
```

## 13. Exact next sprint

Sprint 1: Toolchain probe and minimal compile CLI. Do not begin it without
explicit approval.
