# Sprint 14 Report

## 1. Sprint completed

Sprint 14: Collaboration research prototype completed on 2026-06-14 as a
documentation and security-design sprint. It created the required collaboration
SRS, remote-peer threat model, and ADR before any implementation.

No runtime collaboration code was added. The stable offline application remains
unchanged by default.

## 2. Requirement IDs implemented

- `SRS.md` section 16 Sprint 14 prerequisite: separate collaboration SRS
- `SRS.md` section 16 Sprint 14 prerequisite: transport decision
- `SRS.md` section 16 Sprint 14 prerequisite: remote-peer threat model
- `SRS.md` section 16 Sprint 14 prerequisite: CRDT selection through ADR
- `SRS.md` section 16 Sprint 14 prerequisite: authority for compilation and
  project files
- `SRS.md` section 16 Sprint 14 prerequisite: feature-flag isolation
- `NFR-SEC-013`
- `NFR-SEC-001`, `NFR-SEC-004` through `NFR-SEC-006`
- `NFR-MAINT-004` and `NFR-MAINT-005`
- `NFR-PRIV-001` through `NFR-PRIV-003`

## 3. Files changed

Sprint 14 adds or updates:

- `docs/COLLABORATION_SRS.md`, defining collaboration requirements, non-goals,
  transport assumptions, host authority, feature-flag isolation, acceptance
  scenarios, and future tests;
- `docs/COLLABORATION_THREAT_MODEL.md`, modeling remote peers, trust boundaries,
  assets, abuse paths, mitigations, and security review focus paths;
- `docs/adr/ADR-0015-collaboration-research-prototype.md`, selecting a future
  local-network WebSocket plus Yjs research direction with host authority and
  feature-flag gating;
- updates to architecture, security, threat-model, test-plan, README,
  deferred-issues, sprint-status, and traceability documentation; and
- this sprint report.

No production dependency was added.

## 4. Design decisions

- Treat collaboration as a separate research mode, not file synchronization.
- Do not add runtime collaboration behavior in Sprint 14.
- Prefer a future local-network WebSocket prototype binding to loopback by
  default, with a separate explicit action for LAN binding.
- Evaluate Yjs as the likely CRDT later, but do not add it until an
  implementation sprint justifies the dependency and tests memory growth.
- Keep the host authoritative for project files, saves, settings, generated
  output, and compilation.
- Disable guest compile requests by default and reject guest project mutation in
  the first prototype.
- Gate all future collaboration code behind
  `TEXPULSE_EXPERIMENTAL_COLLABORATION=1`.

## 5. Commands run

```text
pnpm format
pnpm check
pnpm audit:dependencies
```

`pnpm check` expanded to formatting, linting, strict type checking, unit,
component, integration, performance, coverage, Electron E2E, and production
build checks.

## 6. Test results and counts

- Unit: 29 files and 137 tests passed.
- Component: 7 files and 18 tests passed.
- Deterministic integration: 17 files passed, 1 conditional file skipped, 84
  tests passed, and 7 native tests skipped.
- Performance: 1 file and 3 tests passed.
- Coverage: 53 files passed, 1 conditional file skipped, 239 tests passed, and 7
  native tests skipped.
- Coverage totals: 93.53% statements, 85.13% branches, 95.39% functions, and
  93.55% lines.
- Development Electron E2E: 7 passed.
- Formatting, linting, strict type checking, production build, aggregate check,
  and dependency audit: passed.

## 7. Real MiKTeX/PDF evidence

Sprint 14 did not change compilation, SyncTeX, PDF rendering, packaging, or
runtime UI behavior. No new real MiKTeX/PDF evidence was required for this
documentation-only collaboration research sprint.

## 8. Screenshot evidence

No UI was added or changed for Sprint 14, so no screenshot evidence was
required.

## 9. Security review findings

- The complete diff was reviewed against the SRS and project security rules.
- The stable application still has no collaboration listener, remote service,
  collaboration preload method, collaboration UI, remote compile path, or
  collaboration dependency.
- The current 32-method stable preload bridge is unchanged.
- The collaboration SRS requires strict schemas, bounded messages, loopback
  default binding, invitation secrets, host authority, and no guest project
  mutation in the first prototype.
- The collaboration threat model identifies high-priority risks around malicious
  guest source edits, host path escape, CRDT/message denial of service, and
  invitation leakage.
- ADR-0015 records local-network WebSocket and Yjs as a future research
  direction, with implementation gated by tests and a feature flag.

No unresolved Sprint 14 blocker remains.

## 10. Known limitations

- Collaboration remains unimplemented.
- No Yjs, WebSocket listener, protocol schema, collaboration UI, or experimental
  preload method exists yet.
- The transport choice is a proposed research direction, not a shipped
  compatibility guarantee.
- Open questions remain around loopback-only versus LAN mode, guest compile
  permissions, and transport encryption.
- Broader release-candidate limitations from Sprint 12 still apply.

## 11. Technical debt

- Future collaboration implementation must add disabled-path tests proving no
  listener, UI, dependency, or preload method exists without the feature flag.
- Future collaboration implementation must add schema, rate-limit, teardown,
  CRDT merge/reconnect, project-boundary, compiler-authority, and support-log
  redaction tests.
- Future dependency review is required before adding Yjs or any WebSocket
  runtime package.

## 12. Suggested commit message

```text
docs: add Sprint 14 collaboration research controls
```

## 13. Exact next sprint

No next sprint is defined in `docs/SRS.md` after Sprint 14. Future work should
begin only after explicit product direction, with collaboration implementation
remaining gated by the Sprint 14 SRS, threat model, and ADR.
