import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "packages/*/src/**/*.test.ts", "packages/*/src/**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/legacy-v1/**"],
  },
});
