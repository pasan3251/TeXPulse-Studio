// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SettingsDialog } from "../../src/renderer/components/SettingsDialog.js";
import { defaultGlobalSettings } from "../../src/settings/settings-types.js";

const projectSettings = {
  rootFile: "main.tex",
  recipe: "latexmk-pdf" as const,
  buildDirectory: ".texpulse/build",
  autoBuild: true,
  allowLatexmkRc: false,
};

describe("SettingsDialog", () => {
  it("shows honest readiness, validates fields, and saves project settings", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <SettingsDialog
        busy={false}
        globalSettings={defaultGlobalSettings()}
        issues={["Recovered invalid settings."]}
        mode="settings"
        projectSettings={projectSettings}
        rootOptions={["main.tex", "chapters/intro.tex"]}
        toolchain={null}
        onCheckToolchain={vi.fn()}
        onCleanBuild={vi.fn()}
        onCleanupAuxiliary={vi.fn()}
        onClose={vi.fn()}
        onSave={onSave}
        onSkipSetup={vi.fn()}
      />,
    );

    expect(screen.getByText("Readiness not checked")).toBeVisible();
    expect(screen.getByText("Recovered invalid settings.")).toBeVisible();
    expect(
      screen.getByText(/may execute commands while loading/i),
    ).toBeVisible();

    const timeout = screen.getByLabelText("Compile timeout");
    await user.clear(timeout);
    await user.type(timeout, "10");
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    expect(screen.getByText(/Compile timeout must be between/i)).toBeVisible();
    expect(onSave).not.toHaveBeenCalled();

    await user.clear(timeout);
    await user.type(timeout, "180000");
    await user.selectOptions(
      screen.getByLabelText("Compile recipe"),
      "latexmk-xelatex",
    );
    await user.click(screen.getByRole("button", { name: "Save settings" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ compileTimeoutMs: 180000 }),
      expect.objectContaining({ recipe: "latexmk-xelatex" }),
    );
  });

  it("exposes an explicit setup self-test skip", async () => {
    const user = userEvent.setup();
    const onSkipSetup = vi.fn();
    render(
      <SettingsDialog
        busy={false}
        globalSettings={defaultGlobalSettings()}
        issues={[]}
        mode="setup"
        projectSettings={null}
        rootOptions={[]}
        toolchain={null}
        onCheckToolchain={vi.fn()}
        onCleanBuild={vi.fn()}
        onCleanupAuxiliary={vi.fn()}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onSkipSetup={onSkipSetup}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Skip self-test and continue",
      }),
    );
    expect(onSkipSetup).toHaveBeenCalledOnce();
  });

  it("shows missing readiness plus both tool version and path details", () => {
    render(
      <SettingsDialog
        busy={false}
        globalSettings={defaultGlobalSettings()}
        issues={[]}
        mode="setup"
        projectSettings={null}
        rootOptions={[]}
        toolchain={{
          ready: false,
          tools: [
            {
              id: "latexmk",
              label: "latexmk",
              state: "missing",
              path: null,
              version: null,
              exitCode: null,
              detail: "Install MiKTeX and Perl.",
            },
            {
              id: "pdflatex",
              label: "pdfLaTeX",
              state: "available",
              path: "C:\\MiKTeX\\pdflatex.exe",
              version: "4.23",
              exitCode: 0,
              detail: null,
            },
          ],
          issues: [
            {
              severity: "error",
              tool: "latexmk",
              message: "latexmk was not found.",
            },
          ],
          selfTest: {
            status: "failed",
            message: "Required tools are unavailable.",
          },
        }}
        onCheckToolchain={vi.fn()}
        onCleanBuild={vi.fn()}
        onCleanupAuxiliary={vi.fn()}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onSkipSetup={vi.fn()}
      />,
    );

    expect(screen.getByText("Toolchain not ready")).toBeVisible();
    expect(screen.getByText("Self-test: failed")).toBeVisible();
    expect(
      screen.getByText("Version: 4.23 | Path: C:\\MiKTeX\\pdflatex.exe"),
    ).toBeVisible();
    expect(
      screen.getByText("Version: unknown | Path: not found"),
    ).toBeVisible();
    expect(screen.getByText("Install MiKTeX and Perl.")).toBeVisible();
    expect(screen.getByText(/latexmk was not found/)).toBeVisible();
  });
});
