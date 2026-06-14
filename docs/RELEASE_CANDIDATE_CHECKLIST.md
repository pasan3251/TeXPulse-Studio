# Release Candidate Checklist

## Candidate

- Version: `0.1.0-rc.1`
- Source tag: `v0.1.0-rc.1`
- Supported host: native Windows 11 x64
- Verification date: 2026-06-14

## Automated gates

| Gate                | Command                              | Result                          |
| ------------------- | ------------------------------------ | ------------------------------- |
| Frozen install      | `pnpm install --frozen-lockfile`     | Passed                          |
| Formatting          | `pnpm format:check`                  | Passed                          |
| Lint                | `pnpm lint`                          | Passed                          |
| Strict TypeScript   | `pnpm typecheck`                     | Passed                          |
| Unit                | `pnpm test:unit`                     | 132 passed                      |
| Component           | `pnpm test:component`                | 18 passed                       |
| Integration         | `pnpm test:integration`              | 82 passed, 7 native skipped     |
| Performance         | `pnpm test:performance`              | 3 passed                        |
| Coverage            | `pnpm test:coverage`                 | 232 passed, 7 native skipped    |
| Electron E2E        | `pnpm test:e2e`                      | 7 passed                        |
| Production build    | `pnpm build`                         | Passed                          |
| Aggregate           | `pnpm check`                         | Passed                          |
| Dependency audit    | `pnpm audit:dependencies`            | No known high/critical findings |
| Native MiKTeX       | `TEXPULSE_RUN_NATIVE=1` native suite | 7 passed                        |
| Unpacked package    | `pnpm package:dir`                   | Passed                          |
| NSIS installer      | `pnpm package:win`                   | Passed                          |
| Installed lifecycle | `pnpm test:packaged`                 | 2 passed                        |
| Release provenance  | `pnpm release:manifest`              | Passed from tagged clean tree   |

## Performance observations

Reference-host results from `pnpm test:performance`:

- 1,000-file project enumeration: 77 ms.
- Renderer hierarchy construction: 1.23 ms.
- Editor reducer input p95: 0.001 ms; maximum 0.274 ms.
- Repeated-build observation: 500 builds; zero measured retained heap after
  explicit GC.

These are release regression thresholds on the reference host, not universal
hardware guarantees.

## Fixture charter

| Fixture               | Purpose                               | Evidence                      |
| --------------------- | ------------------------------------- | ----------------------------- |
| `minimal-success`     | Basic pdfLaTeX success                | Deterministic and native      |
| `syntax-error`        | LaTeX error diagnostics               | Golden parser and E2E         |
| `undefined-reference` | Reference warning                     | Golden parser                 |
| `bibliography-bibtex` | BibTeX workflow                       | Native                        |
| `bibliography-biber`  | Biber workflow                        | Native                        |
| `multi-file`          | Included source diagnostics           | Integration                   |
| `image-assets`        | Local image inclusion                 | Native and visually inspected |
| `unicode-xelatex`     | Unicode path/content and XeLaTeX      | Native                        |
| `spaces-in-path`      | Project path containing spaces        | Native                        |
| `synctex-multifile`   | Forward/inverse source mapping        | Integration and native        |
| `missing-package`     | Actionable missing-package diagnostic | Golden parser                 |
| `timeout`             | Enforced timeout/process cleanup      | Integration only              |
| `no-pdf-output`       | Successful exit with missing PDF      | Deterministic fake compiler   |
| `malformed-log`       | Raw-log fallback                      | Golden parser                 |

## Manual review

- Project release-candidate screenshot:
  `output/playwright/sprint-12-project-release-candidate.png`.
- Installed high-DPI screenshot:
  `output/playwright/sprint-12-packaged-high-dpi.png`.
- Installed real PDF: `output/playwright/sprint-12-packaged-sample.pdf`.
- Project screenshot inspected for clipping, action labels, selection, status,
  and export notice: passed.
- Installed screenshot and PDF inspection: passed.
- Keyboard review covers project creation inputs, Escape cancellation,
  destructive confirmation focus, named buttons, and recent-project reopening:
  passed.
- Automated DOM review found no duplicate IDs or unnamed buttons in the new
  project workflow.

## Requirement review

- Every SRS requirement and acceptance-scenario ID appears in
  `REQUIREMENTS_TRACEABILITY.md`.
- Mandatory implemented behavior is covered by automated or native evidence.
- SRS-deferred and rejected work is recorded in `DEFERRED_ISSUES.md`.
- Multi-user compilation remains absent under `NFR-SEC-013`.
- No Sprint 13 feature is included.

## Release decision

Ready as the unsigned `0.1.0-rc.1` release candidate on the supported native
Windows 11 x64 host. All Sprint 12 gates, complete-diff review, real MiKTeX
checks, installed lifecycle checks, visual/PDF inspection, and tagged provenance
generation passed. The explicitly deferred issues remain non-blocking and are
recorded in `DEFERRED_ISSUES.md`.
