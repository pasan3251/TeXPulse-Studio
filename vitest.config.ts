import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    clearMocks: true,
    coverage: {
      include: [
        "src/build/build-controller.ts",
        "src/compiler/latexmk-arguments.ts",
        "src/compiler/path-validation.ts",
        "src/process/environment.ts",
        "src/electron/project-ipc.ts",
        "src/electron/project-session.ts",
        "src/electron/window-options.ts",
        "src/ipc/build-contracts.ts",
        "src/ipc/project-contracts.ts",
        "src/project/project-metadata.ts",
        "src/project/project-paths.ts",
        "src/project/project-watcher.ts",
        "src/project/recent-projects.ts",
        "src/project/root-detection.ts",
        "src/renderer/project-tree.ts",
        "src/renderer/live-build-coordinator.ts",
        "src/renderer/workspace-persistence.ts",
        "src/renderer/workspace-state.ts",
        "src/toolchain/executable-discovery.ts",
        "src/toolchain/version-parser.ts",
      ],
      provider: "v8",
      reporter: ["text", "json-summary"],
      thresholds: {
        branches: 85,
        functions: 85,
        lines: 85,
        statements: 85,
      },
    },
    environment: "node",
    include: [
      "tests/unit/**/*.test.ts",
      "tests/component/**/*.test.tsx",
      "tests/integration/**/*.test.ts",
    ],
    mockReset: true,
    restoreMocks: true,
  },
});
