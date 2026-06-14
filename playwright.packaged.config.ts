import { defineConfig } from "@playwright/test";

export default defineConfig({
  forbidOnly: true,
  fullyParallel: false,
  outputDir: "test-results/packaged",
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report/packaged" }],
  ],
  retries: 0,
  testDir: "tests/packaged",
  timeout: 240_000,
  use: {
    trace: "retain-on-failure",
  },
  workers: 1,
});
