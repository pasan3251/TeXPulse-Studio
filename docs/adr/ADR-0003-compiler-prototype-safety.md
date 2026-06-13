# ADR-0003: Compiler Prototype Safety

- Status: Accepted
- Date: 2026-06-13
- Deciders: TeXPulse maintainers
- Related requirements: `FR-BUILD-011`, `FR-BUILD-012`, `FR-BUILD-013`,
  `NFR-SEC-006`, `NFR-SEC-007`

## Context

Sprint 1 needs a real `latexmk` proof before Sprint 2 introduces full build
orchestration, cancellation, timeout, and process-tree cleanup. Even a
developer-only prototype must not establish unsafe command or project-path
patterns.

## Decision

- Launch compiler processes with `spawn(executable, args, { shell: false })`.
- Pass every path as a distinct argument and retain the resolved invocation in
  the structured result.
- Canonicalize the project and root file, require the root to remain inside the
  project, and require build output to be a child directory of the project.
- Use `.texpulse/build` by default.
- Pass `-norc` so system, user, and project `.latexmkrc` files are not trusted
  by the prototype.
- Pass `-no-shell-escape` explicitly.
- Restrict this prototype to trusted local developer projects until Sprint 2
  adds timeout, cancellation, and process-tree cleanup.

## Alternatives considered

- Shell command strings: rejected because quoting and metacharacters make them
  unsafe and unreliable.
- Trust project `.latexmkrc`: deferred until a documented user trust policy is
  implemented.
- Output beside source files: rejected because generated artifacts should be
  separated by default.

## Consequences

- Paths containing spaces remain safe without manual quoting.
- Advanced project-specific `latexmk` configuration is intentionally ignored.
- The prototype is not yet suitable for untrusted or potentially runaway TeX
  input.

## Validation

Unit tests assert the fixed argument array and path boundaries. Integration
tests pass spaces and shell metacharacters through a real child process and use
a fake compiler executable without invoking a shell.
