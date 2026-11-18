import { defineConfig } from "@playwright/test";

export default defineConfig({
  forbidOnly: true,
  fullyParallel: false,
  outputDir: "test-results",
  reporter: [["list"], ["html", { open: "never" }]],
  retries: 0,
  testDir: "tests/e2e",
  timeout: 30_000,
  use: {
    trace: "retain-on-failure",
  },
  workers: 1,
});
