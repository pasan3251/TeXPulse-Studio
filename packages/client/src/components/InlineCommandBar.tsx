import type { AssistantStatusPayload } from "@texpulse/shared";
import { useEffect, useRef, useState } from "react";

interface InlineCommandBarProps {
  status: AssistantStatusPayload | null;
  busy: boolean;
  errorMessage: string | null;
  onSubmit: (instruction: string) => void;
  onClose: () => void;
}

/**
 * Compact 40px floating Mod-K inline AI command bar anchored clear of the
 * CodeMirror 6 gutter. Supports table/equation/CSV synthesis and `@cite topic`.
 */
export function InlineCommandBar({
  status,
  busy,
  errorMessage,
  onSubmit,
  onClose,
}: InlineCommandBarProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submitPrompt = () => {
    const trimmed = query.trim();
    if (!trimmed || busy) return;
    onSubmit(trimmed);
  };

  return (
    <div
      className="tp-inline-command-bar"
      data-testid="inline-command-bar"
      role="dialog"
      aria-label="Inline LaTeX Assistant Command Bar"
    >
      <span
        className={`tp-ai-status-chip${status?.connected ? " connected" : ""}`}
        data-testid="ai-provider-status"
        title={status?.endpointUrl ?? "http://127.0.0.1:11434/v1"}
      >
        <span className="tp-status-dot" />
        <span>{status?.statusLabel ?? "Offline: Start Ollama/LM Studio"}</span>
      </span>

      <input
        ref={inputRef}
        type="text"
        className="tp-inline-cmd-input"
        data-testid="inline-cmd-input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submitPrompt();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
        placeholder='Prompt: "3x4 booktabs table", "Maxwell align", CSV, or "@cite topic"...'
        aria-label="AI LaTeX command prompt"
      />

      {errorMessage ? (
        <span className="tp-inline-cmd-error">{errorMessage}</span>
      ) : null}

      <button
        type="button"
        className="tp-quickfix-btn"
        style={{ padding: "0 7px", flex: "0 0 auto" }}
        data-testid="inline-cmd-submit"
        disabled={busy || query.trim() === ""}
        onClick={submitPrompt}
      >
        {busy ? "..." : "Run"}
      </button>

      <button
        type="button"
        className="tp-icon-btn"
        style={{ padding: "0 5px", flex: "0 0 auto" }}
        data-testid="inline-cmd-close"
        onClick={onClose}
        aria-label="Close command bar"
      >
        ×
      </button>
    </div>
  );
}
