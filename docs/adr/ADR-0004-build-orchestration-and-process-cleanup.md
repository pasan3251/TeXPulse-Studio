# ADR-0004: Build Orchestration and Process Cleanup

- Status: Accepted
- Date: 2026-06-13
- Deciders: TeXPulse maintainers
- Related requirements: `FR-BUILD-004` through `FR-BUILD-009`, `FR-BUILD-016`,
  `FR-BUILD-017`, `NFR-REL-001` through `NFR-REL-003`, `NFR-SEC-008`

## Context

The compiler proof must become a reliable service before any Electron or project
UI depends on it. Rapid requests, stale results, runaway TeX processes, and
launcher descendants can otherwise replace valid output or remain running after
the application considers a build complete.

## Decision

- Scope one `BuildController` instance to one project.
- Assign every request a UUID build ID and monotonically increasing generation.
- Permit one active compile and one pending request; a newer pending request
  supersedes the older pending request.
- Treat an active result as stale when its generation is older than the newest
  requested generation.
- Place each build under
  `<build-directory>\generations\<generation>-<build-id>`.
- Retain metadata for the newest successful, non-stale PDF.
- Pass cancellation through the compiler adapter with `AbortController`.
- Start the timeout when the compiler process is spawned.
- On Windows, invoke the absolute system `taskkill.exe` with `/T /F` and an
  argument array. On POSIX development hosts, use a detached process group and
  terminate the group.
- Reject compiler-adapter results whose build ID or generation differs from the
  active request.

## Consequences

- Stale and failed processes cannot overwrite the retained successful artifact.
- Rapid request bursts run the active build and only the newest pending build.
- Cancellation and timeout wait for process-tree cleanup before returning.
- Generation directories accumulate until a later safe cleanup policy is
  implemented.
- The timeout covers compiler execution, not pre-spawn filesystem discovery.

## Validation

- Unit tests cover state transitions, fake-timer debounce, queue replacement,
  stale results, retained successful metadata, and adapter identity mismatch.
- Integration tests launch a fake compiler with a descendant and verify both
  process IDs are gone after cancellation and timeout.
- A real MiKTeX infinite-loop fixture is terminated by the enforced timeout.
