# ADR-0015: Collaboration Research Prototype Boundary

- Status: Proposed
- Date: 2026-06-14
- Deciders: TeXPulse maintainers
- Related requirements: `NFR-SEC-013`, `NFR-PRIV-001`, `NFR-PRIV-002`,
  `NFR-PRIV-003`, `COLLAB-FR-001` through `COLLAB-FR-013`, `COLLAB-NFR-001`
  through `COLLAB-NFR-008`

## Context

The main SRS defers collaboration until after the offline product is stable and
requires a separate SRS, transport decision, remote-peer threat model, CRDT
selection, authority model, and feature-flag isolation before implementation.

TeXPulse Studio currently has no network service and exposes only a fixed,
validated stable preload bridge. Adding collaboration changes the product from a
single-user local editor to a multi-principal system where remote peers may
influence source content and potentially trigger costly local workflows.

## Decision

The first collaboration research prototype shall be documentation-first and
implementation-gated.

When implementation is later approved, the initial technical direction is:

- use a local-network WebSocket session, binding to loopback by default;
- require a separate explicit host action before LAN binding;
- use short-lived high-entropy invitation secrets;
- evaluate Yjs as the CRDT for shared text buffers;
- keep the host authoritative for project files, saves, settings, generated
  output, and compilation;
- disable guest compile requests by default;
- reject guest file create, rename, delete, export, and settings mutation in the
  first prototype;
- expose collaboration only behind `TEXPULSE_EXPERIMENTAL_COLLABORATION=1`;
- load no collaboration code, dependency, UI, IPC, or listener when the flag is
  absent.

No production dependency is added by this ADR.

## Alternatives considered

- **WebRTC peer-to-peer:** Deferred. It adds signaling, NAT traversal, STUN/TURN
  policy, identity, and relay privacy questions before the product has a basic
  collaboration authority model.
- **Hosted WebSocket service:** Rejected for the first prototype. It conflicts
  with the local-first release posture and requires service operations,
  authentication, storage, abuse handling, and privacy policies.
- **Filesystem synchronization:** Rejected. Collaboration must not be treated as
  file watching or file sync because source merging, project authority, and
  compiler authority need separate controls.
- **Host-only screen sharing style workflow:** Deferred. It avoids CRDT risk but
  does not test collaborative editing semantics.
- **Custom CRDT:** Rejected for the first prototype. Yjs is mature enough to
  evaluate before maintaining a custom merge algorithm.

## Consequences

Positive:

- Keeps the stable offline product free of network exposure by default.
- Gives AppSec and maintainers a clear authority model before code exists.
- Keeps future implementation testable with loopback-only E2E.
- Avoids relay/cloud operations and preserves local-first assumptions.

Negative:

- Local-network WebSocket requires host firewall, binding, and invitation-secret
  UX design.
- Yjs may become a production dependency later and will require dependency
  review, bundle review, audit, and memory-growth tests.
- Guest edit attribution and malicious TeX warnings become necessary before
  enabling remote edits.

Operational:

- Any future prototype must clearly show when collaboration is enabled and what
  address class is bound.
- Support logs must omit invitation secrets and source payloads.
- Build and package checks must prove the disabled path remains unchanged.

Security:

- Remote peers are untrusted.
- The host remains the only authority for files and compilers.
- Remote input must be schema validated, bounded, rate limited, and treated as
  display-untrusted.

## Validation

Before implementing runtime collaboration, maintainers must add:

- tests proving no listener, UI, dependency, or preload method is present when
  the feature flag is absent;
- schema tests for every collaboration message type;
- loopback listener tests with authentication, size limits, rate limits, and
  teardown;
- CRDT merge/reconnect tests with deterministic peer IDs;
- project-boundary tests proving remote messages cannot become absolute paths;
- compiler-authority tests proving guests cannot provide executable, root,
  build-directory, or trust settings;
- support-log tests proving invitation secrets and source payloads are absent;
- a refreshed threat model with code evidence.
