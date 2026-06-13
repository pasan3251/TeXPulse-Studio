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

interface BuildTrace {
  source: string;
  startedAt: number;
  endedAt: number;
  status: "failed" | "succeeded";
}

test("autosaves, collapses builds, stays responsive, and restores the workspace", async () => {
  const projectDirectory = await mkdtemp(join(tmpdir(), "texpulse-e2e-"));
  const mainPath = join(projectDirectory, "main.tex");
  const introPath = join(projectDirectory, "chapters", "intro.tex");
  const tracePath = join(projectDirectory, ".texpulse", "build-trace.jsonl");
  await mkdir(join(projectDirectory, "chapters"));
  await writeFile(
    mainPath,
    "\\documentclass{article}\n\\begin{document}\nOriginal\n\\end{document}\n",
  );
  await writeFile(introPath, "Intro\n");

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
      TEXPULSE_FAKE_DELAY_MS: "1600",
      TEXPULSE_FAKE_TRACE: tracePath,
    },
  });

  const readTrace = async (): Promise<BuildTrace[]> => {
    const raw = await readFile(tracePath, "utf8").catch(() => "");
    return raw
      .split(/\r?\n/u)
      .filter((line) => line !== "")
      .map((line) => JSON.parse(line) as BuildTrace);
  };

  try {
    const page = await electronApp.firstWindow();
    await expect(page).toHaveTitle("TeXPulse Studio");
    await page.evaluate(() => {
      for (const key of Object.keys(window.localStorage)) {
        if (key.startsWith("texpulse.workspace.v1.")) {
          window.localStorage.removeItem(key);
        }
      }
    });

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
        "onProjectFileChanged",
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
    await expect(page.getByLabel("Autosave")).toBeChecked();
    await expect(page.getByLabel("Auto build")).toBeChecked();
    await expect(page.getByLabel("Automatic build delay")).toHaveValue("800");

    const editor = page.getByTestId("code-editor");
    const newestAutomaticSource =
      "\\documentclass{article}\n\\begin{document}\nSprint 6 newest automatic build\n\\end{document}\n";
    await editor.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type(newestAutomaticSource);
    await expect(page.getByText("Build: Debouncing")).toBeVisible();
    await expect(page.getByText("Current build")).toBeVisible();
    await expect(page.getByLabel("PDF page 1")).toBeVisible();
    await expect(page.getByText("Build: succeeded")).toBeVisible();
    await expect
      .poll(() => readFile(mainPath, "utf8"))
      .toBe(newestAutomaticSource);
    await expect.poll(async () => (await readTrace()).length).toBe(1);
    expect((await readTrace())[0]?.source).toBe(newestAutomaticSource);

    const queuedSource =
      "\\documentclass{article}\n\\begin{document}\nQueued build base\n\\end{document}\n";
    await editor.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type(queuedSource);
    await expect(page.getByText("Build: Compiling")).toBeVisible();
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("% newest queued source\n");
    await expect(page.getByText("Build: Queued")).toBeVisible();
    await expect(page.getByText("Build: Compiling")).toBeVisible();
    await expect(page.getByText("Current build")).toBeVisible();
    await expect.poll(async () => (await readTrace()).length).toBe(3);
    expect((await readTrace())[2]?.source).toContain("newest queued source");

    await page.getByLabel("Auto build").uncheck();
    const manualSource =
      "\\documentclass{article}\n\\begin{document}\nManual build base\n\\end{document}\n";
    await editor.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type(manualSource);
    await expect(page.getByText("1 modified")).toBeVisible();
    await expect(page.getByText("All changes saved")).toBeVisible();

    await page.getByRole("button", { name: "Compile", exact: true }).click();
    await expect(page.getByText("Build: Compiling")).toBeVisible();
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("% responsive while compiling\n");
    await expect(editor).toContainText("responsive while compiling");
    await expect(page.getByText("Last successful build")).toBeVisible();
    await expect(page.getByText("All changes saved")).toBeVisible();
    await expect.poll(async () => (await readTrace()).length).toBe(4);

    await page.getByRole("button", { name: "Compile", exact: true }).click();
    await expect(page.getByText("Current build")).toBeVisible();
    await expect.poll(async () => (await readTrace()).length).toBe(5);
    const traces = await readTrace();
    expect(traces[4]?.source).toContain("responsive while compiling");
    for (let index = 1; index < traces.length; index += 1) {
      expect(traces[index]!.startedAt).toBeGreaterThanOrEqual(
        traces[index - 1]!.endedAt,
      );
    }

    const divider = page.getByRole("separator", {
      name: "Resize editor and PDF panes",
    });
    await divider.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.getByRole("button", { name: /intro\.tex/i }).click();
    await expect(
      page.getByLabel("Editor for chapters/intro.tex"),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => {
          for (const key of Object.keys(window.localStorage)) {
            if (!key.startsWith("texpulse.workspace.v1.")) {
              continue;
            }
            const value = window.localStorage.getItem(key);
            if (value !== null) {
              const parsed = JSON.parse(value) as {
                activePath: string | null;
                openPaths: string[];
                paneRatio: number;
              };
              return {
                activePath: parsed.activePath,
                openPaths: parsed.openPaths,
                panePercent: Math.round(parsed.paneRatio * 100),
              };
            }
          }
          return null;
        }),
      )
      .toMatchObject({
        activePath: "chapters/intro.tex",
        openPaths: ["main.tex", "chapters/intro.tex"],
        panePercent: 60,
      });
    await expect(page.getByText("Rendering page...")).toBeHidden();

    const screenshotDirectory = join(repositoryRoot, "output", "playwright");
    await mkdir(screenshotDirectory, { recursive: true });
    await page.screenshot({
      path: join(screenshotDirectory, "sprint-6-live-build.png"),
    });

    await divider.focus();
    await page.keyboard.press("ArrowRight");
    await page.reload();
    await page.getByRole("button", { name: "Open project" }).first().click();
    await expect(
      page.getByLabel("Editor for chapters/intro.tex"),
    ).toBeVisible();
    await expect(page.getByLabel("Auto build")).not.toBeChecked();
    await expect(
      page.getByRole("separator", {
        name: "Resize editor and PDF panes",
      }),
    ).toHaveAttribute("aria-valuenow", "62");

    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(880, 560);
    });
    await expect(
      page.getByLabel("Editor for chapters/intro.tex"),
    ).toBeVisible();
    await page.screenshot({
      path: join(screenshotDirectory, "sprint-6-minimum-window.png"),
    });

    await page.getByLabel("Auto build").check();
    const introEditor = page.getByTestId("code-editor");
    await introEditor.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("Unsaved local intro\n");
    await writeFile(introPath, "External intro\n");
    await expect(
      page.getByText(
        "Compile stopped because the newest source could not save.",
      ),
    ).toBeVisible();
    expect(await readTrace()).toHaveLength(5);
    await expect(introEditor).toContainText("Unsaved local intro");
  } finally {
    await electronApp.close();
    await rm(projectDirectory, { recursive: true, force: true });
  }
});
