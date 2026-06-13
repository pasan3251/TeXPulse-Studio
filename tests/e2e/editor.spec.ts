import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron, expect, test } from "@playwright/test";

const repositoryRoot = resolve(import.meta.dirname, "..", "..");
const fakeLatexmk = join(
  repositoryRoot,
  "tests",
  "integration",
  "fixtures",
  "fake-latexmk.mjs",
);

test("edits, compiles, previews, and retains the last successful PDF", async () => {
  const projectDirectory = await mkdtemp(join(tmpdir(), "texpulse-e2e-"));
  const mainPath = join(projectDirectory, "main.tex");
  await mkdir(join(projectDirectory, "chapters"));
  await writeFile(
    mainPath,
    "\\documentclass{article}\n\\begin{document}\nOriginal\n\\end{document}\n",
  );
  await writeFile(join(projectDirectory, "chapters", "intro.tex"), "Intro\n");

  const electronApp = await electron.launch({
    args: ["."],
    chromiumSandbox: true,
    cwd: repositoryRoot,
    env: {
      ...process.env,
      NODE_ENV: "production",
      TEXPULSE_E2E_LATEXMK: fakeLatexmk,
      TEXPULSE_E2E_NODE: process.execPath,
      TEXPULSE_E2E_PROJECT: projectDirectory,
    },
  });

  try {
    const page = await electronApp.firstWindow();
    await expect(page).toHaveTitle("TeXPulse Studio");

    const securityState = await page.evaluate(() => ({
      nodeRequire: typeof Reflect.get(window, "require"),
      nodeProcess: typeof Reflect.get(window, "process"),
      bridgeKeys: Object.keys(window.texpulse).sort(),
    }));
    expect(securityState).toEqual({
      nodeRequire: "undefined",
      nodeProcess: "undefined",
      bridgeKeys: [
        "cancelBuild",
        "compileProject",
        "loadPdf",
        "openPdf",
        "openProject",
        "readTextFile",
        "revealPdf",
        "writeTextFile",
      ],
    });

    await page.getByRole("button", { name: "Open project" }).first().click();
    await expect(
      page.getByRole("button", { name: /main\.tex/i }),
    ).toBeVisible();

    const editor = page.getByTestId("code-editor");
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type(
      "\\documentclass{article}\n\\begin{document}\nCompiled from Sprint 5\n\\end{document}\n",
    );
    await expect(page.getByLabel("Modified").first()).toBeVisible();

    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("All changes saved")).toBeVisible();
    await expect
      .poll(() => readFile(mainPath, "utf8"))
      .toContain("Compiled from Sprint 5");

    await page.getByRole("button", { name: "Compile", exact: true }).click();
    await expect(page.getByText("Current build")).toBeVisible();
    await expect(page.getByLabel("PDF page 1")).toBeVisible();
    await expect(page.getByText("Build: succeeded")).toBeVisible();
    await page.getByRole("button", { name: "Show log" }).click();
    await expect(page.getByText("fake latexmk log")).toBeVisible();

    const screenshotDirectory = join(repositoryRoot, "output", "playwright");
    await mkdir(screenshotDirectory, { recursive: true });
    await page.screenshot({
      path: join(screenshotDirectory, "sprint-5-pdf-preview.png"),
    });

    await editor.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type(
      "\\documentclass{article}\n% TEXPULSE_FAKE_FAIL\n",
    );
    await page.getByRole("button", { name: "Compile", exact: true }).click();
    await expect(page.getByText("Last successful build")).toBeVisible();
    await expect(page.getByLabel("PDF page 1")).toBeVisible();
    await expect(page.getByText("Build: failed")).toBeVisible();
    await expect(page.getByText("Fake compiler failure.")).toBeVisible();
  } finally {
    await electronApp.close();
    await rm(projectDirectory, { recursive: true, force: true });
  }
});
