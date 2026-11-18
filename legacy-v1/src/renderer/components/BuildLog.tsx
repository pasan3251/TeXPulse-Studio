import type { BuildView } from "../../ipc/build-contracts.js";

interface BuildLogProps {
  build: BuildView;
  onClose: () => void;
}

export function BuildLog({ build, onClose }: BuildLogProps) {
  return (
    <section className="build-log" aria-label="Raw build log">
      <header>
        <div>
          <strong>Raw build log</strong>
          <span>
            Generation {String(build.generation)} · {build.status} ·{" "}
            {String(build.durationMs)} ms
          </span>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close build log"
          onClick={onClose}
        >
          Close
        </button>
      </header>
      <pre>
        {build.log === "" ? "The compiler produced no log output." : build.log}
      </pre>
      {build.logTruncated ? (
        <p>The display is truncated; the complete log remains on disk.</p>
      ) : null}
    </section>
  );
}
