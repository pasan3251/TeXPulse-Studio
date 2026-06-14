import { copyFile, mkdir, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { _electron as electron, expect, test } from "@playwright/test";

const executablePath = requiredEnvironment("TEXPULSE_PACKAGED_EXECUTABLE");
const userDataDirectory = requiredEnvironment("TEXPULSE_PACKAGED_USER_DATA");
const upgradeUserDataDirectory = requiredEnvironment(
  "TEXPULSE_PACKAGED_UPGRADE_USER_DATA",
);
const evidenceDirectory = requiredEnvironment("TEXPULSE_PACKAGED_OUTPUT");

test("installed release candidate completes the sample workflow and reopens cleanly", async () => {
  const launch = () =>
    electron.launch({
      executablePath,
      args: [
        `--user-data-dir=${userDataDirectory}`,
        "--force-device-scale-factor=1.5",
      ],
      chromiumSandbox: true,
      cwd: dirname(executablePath),
      env: { ...process.env, NODE_ENV: "production" },
      timeout: 30_000,
    });

  const firstApp = await launch();
  let actualUserDataDirectory = "";
  try {
    const page = await firstApp.firstWindow();
    await expect(page).toHaveTitle("TeXPulse Studio");
    actualUserDataDirectory = await firstApp.evaluate(({ app }) =>
      app.getPath("userData"),
    );
    expect(resolve(actualUserDataDirectory)).toBe(resolve(userDataDirectory));

    const securityState = await page.evaluate(() => ({
      nodeRequire: typeof Reflect.get(window, "require"),
      nodeProcess: typeof Reflect.get(window, "process"),
      bridgeKeys: Object.keys(window.texpulse).sort(),
    }));
    expect(securityState.nodeRequire).toBe("undefined");
    expect(securityState.nodeProcess).toBe("undefined");
    expect(securityState.bridgeKeys).toEqual([
      "cancelBuild",
      "checkToolchain",
      "cleanBuild",
      "cleanupAuxiliary",
      "clearLocalData",
      "clearRecovery",
      "compileProject",
      "createDirectory",
      "createProject",
      "createTextFile",
      "deleteEntry",
      "exportProject",
      "exportSupportLog",
      "forwardSync",
      "getRecentProjects",
      "getRecovery",
      "getSettings",
      "inverseSync",
      "loadPdf",
      "onProjectFileChanged",
      "openPdf",
      "openProject",
      "openRecentProject",
      "openSampleProject",
      "readTextFile",
      "renameEntry",
      "revealPdf",
      "saveGlobalSettings",
      "saveProjectSettings",
      "saveRecovery",
      "writeTextFile",
    ]);

    const setup = page.getByRole("dialog", {
      name: "Prepare TeXPulse Studio",
    });
    await expect(setup).toBeVisible();
    await setup.getByRole("button", { name: "Run real self-test" }).click();
    await expect(setup.getByText("Toolchain ready")).toBeVisible({
      timeout: 120_000,
    });
    await expect(setup.getByText("Self-test: passed")).toBeVisible();
    await setup.getByRole("button", { name: "Save settings" }).click();
    await expect(setup).toBeHidden();

    await page.getByRole("button", { name: "Open sample project" }).click();
    const editor = page.getByTestId("code-editor");
    await expect(editor).toContainText("Welcome to TeXPulse Studio");
    await page.getByLabel("Autosave").uncheck();
    await page.getByLabel("Auto build").uncheck();
    await editor.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.insertText(sampleSource);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("button", { name: "Compile", exact: true }).click();
    await expect(page.getByText("Build: succeeded")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.getByLabel("PDF page 1")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Loading PDF...")).toBeHidden({
      timeout: 30_000,
    });
    const clippedPdfControls = await page.evaluate(() => {
      const viewportWidth = document.documentElement.clientWidth;
      return [
        ...document.querySelectorAll<HTMLElement>(
          ".pdf-header button, .pdf-toolbar button, .sync-hint",
        ),
      ]
        .filter((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.left < 0 || bounds.right > viewportWidth;
        })
        .map((element) => element.innerText.trim());
    });
    expect(clippedPdfControls).toEqual([]);

    await mkdir(evidenceDirectory, { recursive: true });
    await page.screenshot({
      path: join(evidenceDirectory, "sprint-12-packaged-high-dpi.png"),
    });
    await copyNewestPdf(
      join(actualUserDataDirectory, "sample-project", ".texpulse", "build"),
      join(evidenceDirectory, "sprint-12-packaged-sample.pdf"),
    );
  } finally {
    await firstApp.close();
  }

  const secondApp = await launch();
  try {
    const page = await secondApp.firstWindow();
    await expect(
      page.getByRole("dialog", { name: "Prepare TeXPulse Studio" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Open sample project" }).click();
    await expect(page.getByTestId("code-editor")).toContainText(
      "Packaged release-candidate verification",
    );
  } finally {
    await secondApp.close();
  }
});

test("installed release candidate preserves previous-beta settings", async () => {
  const electronApp = await electron.launch({
    executablePath,
    args: [`--user-data-dir=${upgradeUserDataDirectory}`],
    chromiumSandbox: true,
    cwd: dirname(executablePath),
    env: { ...process.env, NODE_ENV: "production" },
    timeout: 30_000,
  });

  try {
    const page = await electronApp.firstWindow();
    await expect(
      page.getByRole("dialog", { name: "Prepare TeXPulse Studio" }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Autosave")).not.toBeChecked();
    await expect(page.getByLabel("Auto build")).not.toBeChecked();
    await expect(page.getByLabel("Automatic build delay")).toHaveValue("1200");
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByLabel("Editor font size")).toHaveValue("18");
    await expect(page.getByLabel("Default PDF zoom")).toHaveValue("fit-page");
  } finally {
    await electronApp.close();
  }
});

const sampleSource = String.raw`\documentclass{article}
\begin{document}
Packaged release-candidate verification
\end{document}
`;

async function copyNewestPdf(
  buildDirectory: string,
  destination: string,
): Promise<void> {
  const generationsDirectory = join(buildDirectory, "generations");
  const generations = await readdir(generationsDirectory, {
    withFileTypes: true,
  });
  const candidates = generations
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(generationsDirectory, entry.name, "main.pdf"));
  if (candidates.length === 0) {
    throw new Error("The packaged sample build produced no PDF generation.");
  }
  await copyFile(candidates.at(-1)!, destination);
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is required for packaged application tests.`);
  }
  return value;
}
