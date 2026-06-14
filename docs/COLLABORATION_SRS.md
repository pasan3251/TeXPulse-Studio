# Collaboration Research SRS

## Document Purpose

This document is the separate collaboration Software Requirements Specification
required by `docs/SRS.md` Sprint 14 before any collaboration implementation. It
defines a research-only scope for future collaborative editing while preserving
TeXPulse Studio's stable offline, single-user path.

This document is not approval to ship collaboration in the release candidate. No
network listener, shared editing runtime, remote compilation path, or production
dependency is implemented by Sprint 14.

## Product Context

TeXPulse Studio is currently an offline Windows LaTeX editor. Its stable path
keeps source files local, compiles through the user's local MiKTeX toolchain,
and isolates privileged filesystem/process work in the Electron main process.

Collaboration changes the risk profile because remote peers may influence source
text, metadata, presence state, project file operations, and compile requests.
Collaboration must therefore be treated as a separate product mode, not as an
extension of file watching or project synchronization.

## Research Goal

Define the minimum architecture, authority model, and safety rules needed to
prototype collaborative editing without weakening the stable offline product.

## Assumptions

- Collaboration is optional, experimental, and disabled by default.
- The first research target is a trusted small local network, not the public
  internet.
- A host user opens a local project and explicitly starts a collaboration
  session.
- Guest users connect only after the host shares an invitation token or code.
- Source content remains on the host machine by default.
- Remote peers are not trusted to access arbitrary host files or run compilers.
- The stable single-user code path must work identically when collaboration is
  disabled.

## Non-Goals

- Hosted cloud workspaces.
- Public project sharing.
- Remote build workers.
- Multi-user compilation authority for guests.
- General file synchronization.
- Chat, comments, tracked changes, or account systems.
- Internet relay, TURN, STUN, NAT traversal, or browser-to-browser WebRTC in the
  first research prototype.
- Shipping collaboration in the `0.1.0-rc.1` release candidate.

## Transport Decision

The first research prototype shall use a feature-flagged local-network WebSocket
session hosted by the TeXPulse main process or a dedicated local helper process.

WebRTC is deferred because it introduces signaling, NAT traversal, relay, and
identity complexity. Hosted WebSocket is rejected for the first prototype
because it would violate the local-first release posture and require a service
operations model. Local-network WebSocket keeps the experiment observable,
testable, and compatible with the offline architecture.

## CRDT Decision

The first research prototype should evaluate Yjs as the CRDT layer. Yjs is not
added as a production dependency until a later implementation sprint proves the
need, records dependency risk, and adds tests. If Yjs is rejected, the
replacement CRDT must provide deterministic merge behavior, bounded memory
growth, explicit awareness/presence data, and serializable updates suitable for
schema validation.

## Authority Model

The host owns:

- project root selection;
- project file enumeration and validation;
- source file persistence;
- version-token save checks;
- project metadata;
- compile requests and cancellation;
- generated output and PDF artifacts;
- access control for collaboration sessions.

Guests may propose:

- text edits to already shared buffers;
- cursor or presence updates;
- requests to open a file already shared by the host;
- explicit compile requests, only if the host grants that permission.

Guests must not directly:

- select host filesystem paths;
- create, rename, move, delete, or export project files in the first prototype;
- edit `.texpulse` metadata;
- invoke local tools or custom executables;
- enable `latexmk` configuration trust;
- access raw canonical host paths;
- receive generated PDF filesystem paths;
- write source files without host-side validation and version checks.

## Feature-Flag Boundary

Collaboration must remain behind an explicit experimental flag. The default
application must:

- open no listening socket;
- expose no collaboration preload method;
- add no collaboration menu item;
- load no collaboration dependency;
- preserve the current Content Security Policy;
- preserve the existing 34 fixed stable preload methods.

The future flag name should be `TEXPULSE_EXPERIMENTAL_COLLABORATION=1` unless an
ADR chooses another name. Enabling the flag must show a visible experimental
warning before any listener starts.

## Functional Requirements

| ID              | Requirement                                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `COLLAB-FR-001` | Collaboration shall be disabled by default and require an explicit flag.                                                          |
| `COLLAB-FR-002` | A host shall explicitly start and stop a local collaboration session.                                                             |
| `COLLAB-FR-003` | A session shall bind only to loopback by default. LAN binding shall require a separate host action.                               |
| `COLLAB-FR-004` | Each guest connection shall require an invitation secret with bounded lifetime.                                                   |
| `COLLAB-FR-005` | The host shall choose which project files are shared.                                                                             |
| `COLLAB-FR-006` | Guests shall receive project-relative file identifiers, never canonical host paths.                                               |
| `COLLAB-FR-007` | Text updates shall be schema validated, bounded, ordered, and attributed to a peer.                                               |
| `COLLAB-FR-008` | Host persistence shall continue through existing project service and version-token checks.                                        |
| `COLLAB-FR-009` | Remote peers shall not directly perform project file create, rename, delete, export, or settings mutation in the first prototype. |
| `COLLAB-FR-010` | Remote compile requests shall be disabled by default and host-mediated if later enabled.                                          |
| `COLLAB-FR-011` | Presence data shall be treated as untrusted display text and bounded.                                                             |
| `COLLAB-FR-012` | Session teardown shall remove peer state and close sockets deterministically.                                                     |
| `COLLAB-FR-013` | Collaboration logs shall avoid source content by default and redact invitation secrets.                                           |

## Non-Functional Requirements

| ID               | Requirement                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| `COLLAB-NFR-001` | The stable offline path shall not load or expose collaboration code unless the feature flag is enabled.   |
| `COLLAB-NFR-002` | Collaboration message payloads shall use strict schemas and explicit versioning.                          |
| `COLLAB-NFR-003` | Message size, peer count, update rate, and retained CRDT state shall be bounded.                          |
| `COLLAB-NFR-004` | Guest input shall never become a host filesystem path or process argument without host-side validation.   |
| `COLLAB-NFR-005` | The host shall retain final authority over source persistence and compilation.                            |
| `COLLAB-NFR-006` | The prototype shall have deterministic unit tests for merge, reconnect, rejection, and teardown behavior. |
| `COLLAB-NFR-007` | Any production dependency shall be justified by ADR and covered by audit, lockfile, and tests.            |
| `COLLAB-NFR-008` | No telemetry, cloud service, or external relay shall be introduced by the first prototype.                |

## Acceptance Scenarios

### `COLLAB-AS-001`: Feature Disabled

Given the experimental flag is absent, when TeXPulse starts, then no
collaboration listener opens, no collaboration preload method is exposed, and
the single-user workflows remain unchanged.

### `COLLAB-AS-002`: Host Starts Loopback Session

Given the experimental flag is enabled and a project is open, when the host
starts a loopback session, then TeXPulse creates a bounded invitation secret,
shows the active session state, and accepts only schema-valid local clients.

### `COLLAB-AS-003`: Guest Text Update

Given a guest is connected and the host shared `main.tex`, when the guest sends
a bounded text update, then the CRDT state changes, the editor reflects the
merged text, and disk persistence still waits for host-side save/version checks.

### `COLLAB-AS-004`: Rejected Filesystem Operation

Given a guest sends a create, rename, delete, export, settings, or absolute path
request, when the host validates the message, then the request is rejected,
logged without secrets/source content, and no project file changes.

### `COLLAB-AS-005`: Host-Mediated Compile Request

Given the host later enables guest compile requests, when a guest requests a
compile, then the host decides whether to run the existing local compile
pipeline; no guest-provided command, root path, or build directory is accepted.

## Test Strategy

Future implementation must add:

- pure CRDT/update tests with deterministic clocks and peer IDs;
- schema rejection tests for malformed, oversized, out-of-order, and replayed
  messages;
- local-network listener tests that bind loopback by default;
- teardown tests that prove sockets and peer state close;
- renderer tests that prove collaboration UI is absent when disabled;
- IPC tests for any experimental preload methods;
- E2E tests for disabled stable path and enabled local two-peer path;
- security tests for guest attempts to access files, settings, compiler, and
  generated artifacts.

## Exit Criteria For A Future Prototype Sprint

- Collaboration remains disabled by default.
- Stable `pnpm check` still passes with the flag disabled.
- A focused enabled-mode suite passes without network access beyond loopback.
- The threat model is updated with implementation evidence.
- No remote peer can compile, save, or mutate files outside the host authority
  model.
