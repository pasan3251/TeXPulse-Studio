import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron, expect, test } from "@playwright/test";

const repositoryRoot = resolve(import.meta.dirname, "..", "..");

test("opens, edits, and saves through the isolated preload API", async () => {
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
      bridgeKeys: ["openProject", "readTextFile", "writeTextFile"],
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
      "\\documentclass{article}\n\\begin{document}\nSaved from Sprint 4\n\\end{document}\n",
    );
    await expect(page.getByLabel("Modified").first()).toBeVisible();

    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("All changes saved")).toBeVisible();
    await expect
      .poll(() => readFile(mainPath, "utf8"))
      .toContain("Saved from Sprint 4");

    const screenshotDirectory = join(repositoryRoot, "output", "playwright");
    await mkdir(screenshotDirectory, { recursive: true });
    await page.screenshot({
      path: join(screenshotDirectory, "sprint-4-editor.png"),
    });
  } finally {
    await electronApp.close();
    await rm(projectDirectory, { recursive: true, force: true });
  }
});
