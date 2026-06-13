const suite = process.argv[2];
const supportedSuites = new Set(["integration", "e2e"]);

if (!supportedSuites.has(suite)) {
  console.error("Expected an integration or e2e suite name.");
  process.exitCode = 1;
} else {
  console.log(
    `No ${suite} tests are applicable in Sprint 0 because no product surface exists yet.`,
  );
}
