import type { RecoverySnapshot } from "../../ipc/recovery-contracts.js";

interface RecoveryDialogProps {
  busy: boolean;
  snapshot: RecoverySnapshot;
  onDiscard: () => void;
  onRestore: () => void;
}

export function RecoveryDialog({
  busy,
  snapshot,
  onDiscard,
  onRestore,
}: RecoveryDialogProps) {
  return (
    <div className="dialog-backdrop">
      <section
        className="recovery-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-title"
      >
        <header>
          <div>
            <p className="eyebrow">Crash recovery</p>
            <h2 id="recovery-title">Review unsaved editor content</h2>
          </div>
        </header>
        <div className="recovery-content">
          <p>
            TeXPulse Studio found locally stored unsaved content from{" "}
            {new Date(snapshot.savedAt).toLocaleString()}. Restoring opens it in
            the editor and does not write project files.
          </p>
          <ul>
            {snapshot.buffers.map((buffer) => (
              <li key={buffer.path}>
                <strong>{buffer.path}</strong>
                <code>{preview(buffer.content)}</code>
              </li>
            ))}
          </ul>
        </div>
        <footer>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onDiscard}
          >
            Discard recovery
          </button>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={onRestore}
          >
            {busy ? "Restoring..." : "Restore to editor"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function preview(content: string): string {
  const normalized = content.replaceAll(/\s+/gu, " ").trim();
  return normalized.length <= 180
    ? normalized
    : `${normalized.slice(0, 177)}...`;
}
