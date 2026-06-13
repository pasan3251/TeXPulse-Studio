import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LiveBuildCoordinator,
  defaultLiveBuildSettings,
  type LiveBuildPhase,
} from "../../src/renderer/live-build-coordinator.js";

afterEach(() => {
  vi.useRealTimers();
});

function createCoordinator(options: { saveResult?: boolean } = {}) {
  const phases: LiveBuildPhase[] = [];
  const save = vi.fn(() => Promise.resolve(options.saveResult ?? true));
  const build = vi.fn(() => Promise.resolve());
  const onBuildBlocked = vi.fn();
  const onUnexpectedError = vi.fn();
  const coordinator = new LiveBuildCoordinator({
    save,
    build,
    onPhaseChange: (phase) => {
      phases.push(phase);
    },
    onBuildBlocked,
    onUnexpectedError,
  });
  return {
    build,
    coordinator,
    onBuildBlocked,
    onUnexpectedError,
    phases,
    save,
  };
}

describe("LiveBuildCoordinator", () => {
  it("collapses rapid edits into one save and build after 800 ms", async () => {
    vi.useFakeTimers();
    const fixture = createCoordinator();

    fixture.coordinator.noteEdit();
    await vi.advanceTimersByTimeAsync(300);
    fixture.coordinator.noteEdit();
    await vi.advanceTimersByTimeAsync(500);
    fixture.coordinator.noteEdit();
    await vi.advanceTimersByTimeAsync(799);
    expect(fixture.save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(fixture.save).toHaveBeenCalledOnce();
    expect(fixture.build).toHaveBeenCalledOnce();
    expect(fixture.phases).toEqual([
      "debouncing",
      "saving",
      "compiling",
      "idle",
    ]);
  });

  it("prevents compilation and reports the block when saving fails", async () => {
    vi.useFakeTimers();
    const fixture = createCoordinator({ saveResult: false });

    fixture.coordinator.noteEdit();
    await vi.advanceTimersByTimeAsync(800);

    expect(fixture.build).not.toHaveBeenCalled();
    expect(fixture.onBuildBlocked).toHaveBeenCalledOnce();
    expect(fixture.phases).toEqual(["debouncing", "saving", "idle"]);
  });

  it("keeps manual compilation available when automatic build is disabled", async () => {
    vi.useFakeTimers();
    const fixture = createCoordinator();
    fixture.coordinator.configure({
      ...defaultLiveBuildSettings(false),
      autosave: true,
    });

    fixture.coordinator.noteEdit();
    await vi.advanceTimersByTimeAsync(800);
    expect(fixture.save).toHaveBeenCalledOnce();
    expect(fixture.build).not.toHaveBeenCalled();

    await fixture.coordinator.manualBuild();
    expect(fixture.save).toHaveBeenCalledTimes(2);
    expect(fixture.build).toHaveBeenCalledOnce();
  });

  it("does no background I/O when both automatic settings are disabled", async () => {
    vi.useFakeTimers();
    const fixture = createCoordinator();
    fixture.coordinator.configure({
      autosave: false,
      autoBuild: false,
      debounceMs: 800,
    });

    fixture.coordinator.noteEdit();
    await vi.advanceTimersByTimeAsync(2_000);

    expect(fixture.save).not.toHaveBeenCalled();
    expect(fixture.build).not.toHaveBeenCalled();
  });

  it("reschedules a pending edit when the debounce setting changes", async () => {
    vi.useFakeTimers();
    const fixture = createCoordinator();

    fixture.coordinator.noteEdit();
    await vi.advanceTimersByTimeAsync(400);
    fixture.coordinator.configure({
      autosave: true,
      autoBuild: true,
      debounceMs: 1200,
    });
    await vi.advanceTimersByTimeAsync(1199);
    expect(fixture.save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(fixture.save).toHaveBeenCalledOnce();
    expect(fixture.build).toHaveBeenCalledOnce();
  });

  it("returns to idle when an edit supersedes a manual build", async () => {
    vi.useFakeTimers();
    let completeBuild!: () => void;
    const phases: LiveBuildPhase[] = [];
    const coordinator = new LiveBuildCoordinator({
      save: () => Promise.resolve(true),
      build: () =>
        new Promise<void>((resolve) => {
          completeBuild = resolve;
        }),
      onPhaseChange: (phase) => {
        phases.push(phase);
      },
      onBuildBlocked: vi.fn(),
      onUnexpectedError: (error) => {
        throw error;
      },
    });
    coordinator.configure({
      autosave: true,
      autoBuild: false,
      debounceMs: 800,
    });

    const manualBuild = coordinator.manualBuild();
    await vi.advanceTimersByTimeAsync(0);
    coordinator.noteEdit();
    await vi.advanceTimersByTimeAsync(800);
    completeBuild();
    await manualBuild;

    expect(phases.at(-1)).toBe("idle");
  });

  it("contains rejected save and build callbacks", async () => {
    vi.useFakeTimers();
    const saveError = new Error("save crashed");
    const saveUnexpected = vi.fn();
    const saveBlocked = vi.fn();
    const saveCoordinator = new LiveBuildCoordinator({
      save: () => Promise.reject(saveError),
      build: vi.fn(),
      onPhaseChange: vi.fn(),
      onBuildBlocked: saveBlocked,
      onUnexpectedError: saveUnexpected,
    });
    saveCoordinator.noteEdit();
    await vi.advanceTimersByTimeAsync(800);
    expect(saveUnexpected).toHaveBeenCalledWith(saveError);
    expect(saveBlocked).toHaveBeenCalledOnce();

    const buildError = new Error("build crashed");
    const buildUnexpected = vi.fn();
    const phases: LiveBuildPhase[] = [];
    const buildCoordinator = new LiveBuildCoordinator({
      save: () => Promise.resolve(true),
      build: () => Promise.reject(buildError),
      onPhaseChange: (phase) => {
        phases.push(phase);
      },
      onBuildBlocked: vi.fn(),
      onUnexpectedError: buildUnexpected,
    });
    await buildCoordinator.manualBuild();
    expect(buildUnexpected).toHaveBeenCalledWith(buildError);
    expect(phases.at(-1)).toBe("idle");
  });

  it("cancels pending timers and ignores work after disposal", async () => {
    vi.useFakeTimers();
    const fixture = createCoordinator();
    const revision = fixture.coordinator.noteEdit();
    fixture.coordinator.cancelPending();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fixture.save).not.toHaveBeenCalled();

    fixture.coordinator.dispose();
    expect(fixture.coordinator.isCurrentRevision(revision)).toBe(false);
    fixture.coordinator.noteEdit();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fixture.save).not.toHaveBeenCalled();
  });
});
