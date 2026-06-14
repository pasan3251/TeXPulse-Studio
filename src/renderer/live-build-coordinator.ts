export interface LiveBuildSettings {
  autosave: boolean;
  autoBuild: boolean;
  debounceMs: number;
}

export type LiveBuildPhase =
  | "idle"
  | "debouncing"
  | "saving"
  | "queued"
  | "compiling";

export const DEFAULT_BUILD_DEBOUNCE_MS = 800;

export function defaultLiveBuildSettings(autoBuild = true): LiveBuildSettings {
  return {
    autosave: true,
    autoBuild,
    debounceMs: DEFAULT_BUILD_DEBOUNCE_MS,
  };
}

export interface LiveBuildCoordinatorCallbacks {
  save: () => Promise<boolean>;
  build: (revision: number) => Promise<void>;
  onPhaseChange: (phase: LiveBuildPhase) => void;
  onBuildBlocked: () => void;
  onUnexpectedError: (error: unknown) => void;
}

export class LiveBuildCoordinator {
  private settings = defaultLiveBuildSettings();
  private revision = 0;
  private phase: LiveBuildPhase = "idle";
  private timer: ReturnType<typeof setTimeout> | null = null;
  private saveTail: Promise<void> = Promise.resolve();
  private activeBuildRequests = 0;
  private disposed = false;

  constructor(private readonly callbacks: LiveBuildCoordinatorCallbacks) {}

  configure(settings: LiveBuildSettings): void {
    const hadPendingTimer = this.timer !== null;
    this.settings = { ...settings };
    if (!settings.autosave && !settings.autoBuild) {
      this.clearTimer();
      this.setPhase(this.activeBuildRequests > 0 ? "compiling" : "idle");
    } else if (hadPendingTimer) {
      this.schedule();
    }
  }

  noteEdit(): number {
    this.revision += 1;
    if (!this.settings.autosave && !this.settings.autoBuild) {
      this.setPhase(this.activeBuildRequests > 0 ? "compiling" : "idle");
      return this.revision;
    }

    this.schedule();
    return this.revision;
  }

  manualBuild(): Promise<void> {
    this.clearTimer();
    return this.flush(this.revision, true);
  }

  cancelPending(): void {
    this.clearTimer();
    this.setPhase(this.activeBuildRequests > 0 ? "compiling" : "idle");
  }

  isCurrentRevision(revision: number): boolean {
    return !this.disposed && revision === this.revision;
  }

  currentRevision(): number {
    return this.revision;
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
  }

  private schedule(): void {
    this.clearTimer();
    const scheduledRevision = this.revision;
    this.setPhase("debouncing");
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush(scheduledRevision, false);
    }, this.settings.debounceMs);
  }

  private async flush(revision: number, manual: boolean): Promise<void> {
    if (!this.isCurrentRevision(revision)) {
      return;
    }

    this.setPhase("saving");
    const saved = await this.enqueueSave();
    if (!this.isCurrentRevision(revision)) {
      return;
    }
    const shouldBuild = manual || this.settings.autoBuild;
    if (!saved) {
      if (shouldBuild) {
        this.callbacks.onBuildBlocked();
      }
      this.setPhase(this.activeBuildRequests > 0 ? "compiling" : "idle");
      return;
    }
    if (!shouldBuild) {
      this.setPhase(this.activeBuildRequests > 0 ? "compiling" : "idle");
      return;
    }

    this.activeBuildRequests += 1;
    this.setPhase(this.activeBuildRequests > 1 ? "queued" : "compiling");
    try {
      await this.callbacks.build(revision);
    } catch (error) {
      this.callbacks.onUnexpectedError(error);
    } finally {
      this.activeBuildRequests -= 1;
      if (
        this.activeBuildRequests === 0 &&
        this.timer === null &&
        (this.phase === "compiling" || this.phase === "queued")
      ) {
        this.setPhase("idle");
      } else if (
        this.activeBuildRequests > 0 &&
        this.timer === null &&
        this.phase === "queued"
      ) {
        this.setPhase("compiling");
      } else if (this.isCurrentRevision(revision) && this.timer === null) {
        this.setPhase(this.activeBuildRequests > 0 ? "compiling" : "idle");
      }
    }
  }

  private enqueueSave(): Promise<boolean> {
    const save = this.saveTail.then(() => this.callbacks.save());
    this.saveTail = save.then(
      () => undefined,
      () => undefined,
    );
    return save.catch((error: unknown) => {
      this.callbacks.onUnexpectedError(error);
      return false;
    });
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private setPhase(phase: LiveBuildPhase): void {
    if (this.disposed || this.phase === phase) {
      return;
    }
    this.phase = phase;
    this.callbacks.onPhaseChange(phase);
  }
}
