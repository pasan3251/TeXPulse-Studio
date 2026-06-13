const suite = process.argv[2];
const supportedSuites = new Set(["e2e"]);

if (!supportedSuites.has(suite)) {
  console.error("Expected the e2e suite name.");
  process.exitCode = 1;
} else {
  console.log(
    "No e2e tests are applicable in Sprint 2 because no UI surface exists yet.",
  );
}
