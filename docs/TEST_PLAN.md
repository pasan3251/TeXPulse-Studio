# Test Plan

## Sprint 0 scope

Sprint 0 verifies the repository controls without exercising product behavior.

| Check        | Command                 | Current evidence                               |
| ------------ | ----------------------- | ---------------------------------------------- |
| Formatting   | `pnpm format:check`     | Prettier checks repository text files          |
| Linting      | `pnpm lint`             | ESLint checks JavaScript and TypeScript        |
| Strict types | `pnpm typecheck`        | TypeScript strict project check                |
| Unit tests   | `pnpm test:unit`        | Health, configuration, CI YAML, strict failure |
| Integration  | `pnpm test:integration` | Explicitly reports no product surface          |
| E2E          | `pnpm test:e2e`         | Explicitly reports no product surface          |
| Build        | `pnpm build`            | Emits the health module                        |
| Aggregate    | `pnpm check`            | Runs every current gate in sequence            |

## Determinism

- Tests use no network, compiler, Electron process, or arbitrary sleep.
- The strict-mode test creates an isolated temporary TypeScript source and
  requires diagnostic `TS7006`.
- The CI test parses `.github/workflows/ci.yml` and verifies the Windows runner.

## Later test levels

The SRS requires unit, component, integration, E2E, manual, security, and
performance tests as relevant product surfaces arrive. Fake compilers will be
used for deterministic automation. Real MiKTeX results will always be labeled
separately and generated PDFs will be inspected.

## Clean-state procedure

1. Copy only non-ignored repository files to an empty directory.
2. Run `pnpm install --frozen-lockfile`.
3. Run `pnpm check`.
4. Record the result in the sprint report.
