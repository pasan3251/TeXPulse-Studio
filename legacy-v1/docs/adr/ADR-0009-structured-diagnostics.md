# ADR-0009: Structured diagnostics

- Status: Accepted
- Date: 2026-06-14

## Context

Sprint 7 must convert compiler output into useful source-linked problems without
making log text a filesystem capability, hiding unknown output, weakening stale
build controls, or adding renderer privileges. MiKTeX, `latexmk`, BibTeX, and
Biber emit several formats, including file-line messages that MiKTeX can wrap at
79 columns.

## Decision

- Keep diagnostic parsing in a pure `src/diagnostics/` module with no Electron
  or filesystem access.
- Parse only the bounded raw-log copy assembled by the project session. Emit at
  most 200 diagnostics, with messages limited to 4,096 characters and raw
  excerpts to 2,048 characters.
- Model severity, message, optional file/line/column, source tool, and raw
  excerpt in strict TypeScript and Zod contracts.
- Resolve a log path only when it equals or ends with a file already enumerated
  in the open project. Return only the project-relative file; otherwise return
  no location.
- Recognize common LaTeX, `latexmk`, BibTeX, Biber, timeout, cancellation, and
  malformed-output cases. Reassemble MiKTeX file-line messages only when a line
  reaches the known 79-column wrap width.
- Preserve the raw log independently. Parser failure or an unknown format emits
  a fallback diagnostic and never removes the raw text.
- Reuse existing build generation and renderer source-revision checks so stale
  output cannot become current diagnostics. Clear diagnostics after edits.
- Render diagnostic strings as ordinary escaped React text. Add CodeMirror line
  decorations and use the existing validated file-read preload method for
  navigation.
- Add no preload method and no production dependency.

## Alternatives considered

- Parsing in the renderer was rejected because the main process already owns
  completed build state and can enforce one typed bounded response.
- Passing absolute paths through IPC was rejected because path text must not
  become an actionable renderer capability.
- Parsing only `-file-line-error` output was rejected because bibliography
  tools, missing packages, timeout/cancellation, and common warning formats
  require separate handling.
- Hiding the raw log after successful parsing was rejected because parsers are
  necessarily incomplete and troubleshooting requires original output.
- Adding a parser package was rejected because the required formats are bounded,
  testable, and small enough for a focused local module.

## Consequences

- The renderer receives bounded structured diagnostics plus the existing bounded
  raw log.
- Common failures are source-linked, while unknown or locationless messages
  remain visible but cannot trigger navigation.
- Diagnostics only link files present when the project session was opened. Newly
  added files require reopening until project enumeration is refreshed.
- TeX log nesting is interpreted conservatively; unusual tools and custom log
  formats may fall back to the raw log.
- Total child-process stdout/stderr capture remains a Sprint 10 hardening item.

## Validation

- Golden parser fixtures cover LaTeX, missing package, reference/citation, box,
  BibTeX, Biber, multi-file, and malformed output.
- Unit tests cover status events, explicit severity, MiKTeX wrapping, bounds,
  deduplication, fallback, and stale reducer behavior.
- Component tests cover accessible labels, safe text rendering, editor markers,
  focus, and navigation.
- Session integration verifies a nested source maps to the correct relative path
  and line without leaking the project root.
- Electron E2E covers failed-build retention, Problems/raw-log switching,
  source-line focus, screenshot evidence, and fix-error cleanup.
- A native MiKTeX 4.88 failure log parsed to one `main.tex` line 4 undefined
  control-sequence diagnostic.
