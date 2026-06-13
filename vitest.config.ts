import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    clearMocks: true,
    coverage: {
      include: [
        "src/compiler/latexmk-arguments.ts",
        "src/compiler/path-validation.ts",
        "src/process/environment.ts",
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
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    mockReset: true,
    restoreMocks: true,
  },
});
