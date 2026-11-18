import type {
  AssistantProviderConfig,
  AssistantProviderKind,
  AssistantStatusPayload,
  CompileEngine,
  EditorSettingsConfig,
} from "@texpulse/shared";
import { useEffect, useState } from "react";

interface SettingsModalProps {
  settings: EditorSettingsConfig;
  aiStatus: AssistantStatusPayload | null;
  onSave: (next: EditorSettingsConfig) => void;
  onTestAiConnection: (
    config: AssistantProviderConfig,
  ) => Promise<AssistantStatusPayload>;
  onClose: () => void;
}

const PROVIDER_OPTIONS: ReadonlyArray<{
  id: AssistantProviderKind;
  label: string;
  defaultUrl: string;
  defaultModel: string;
  hint: string;
}> = [
  {
    id: "ollama",
    label: "Ollama :11434",
    defaultUrl: "http://127.0.0.1:11434/v1",
    defaultModel: "qwen2.5-coder:7b",
    hint: "100% local OpenAI-compatible runtime on port 11434.",
  },
  {
    id: "lmstudio",
    label: "LM Studio :1234",
    defaultUrl: "http://127.0.0.1:1234/v1",
    defaultModel: "local-model",
    hint: "100% local LM Studio desktop server on port 1234.",
  },
  {
    id: "custom-openai",
    label: "Custom Local URL",
    defaultUrl: "http://127.0.0.1:8080/v1",
    defaultModel: "qwen2.5-coder:7b",
    hint: "Any local llama.cpp, vLLM, or OpenAI-compatible /v1 endpoint.",
  },
  {
    id: "gemini",
    label: "Opt-in Gemini API",
    defaultUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-2.5-flash",
    hint: "Optional cloud endpoint via GEMINI_API_KEY env var or key below.",
  },
];

const ENGINE_OPTIONS: ReadonlyArray<{ id: CompileEngine; label: string }> = [
  { id: "pdflatex", label: "pdflatex (Fast .fmt Cache)" },
  { id: "xelatex", label: "xelatex" },
  { id: "lualatex", label: "lualatex" },
];

/**
 * Apple HIG hairline-bordered modal for compiler engine, auto-compile toggle,
 * and 100% opt-in local-first AI endpoint configuration.
 */
export function SettingsModal({
  settings,
  aiStatus,
  onSave,
  onTestAiConnection,
  onClose,
}: SettingsModalProps) {
  const [engine, setEngine] = useState<CompileEngine>(settings.engine);
  const [autoCompileOnPause, setAutoCompileOnPause] = useState<boolean>(
    settings.autoCompileOnPause,
  );
  const [provider, setProvider] = useState<AssistantProviderKind>(
    settings.assistant.provider,
  );
  const [endpointUrl, setEndpointUrl] = useState<string>(
    settings.assistant.endpointUrl,
  );
  const [model, setModel] = useState<string>(settings.assistant.model);
  const [apiKey, setApiKey] = useState<string>(settings.assistant.apiKey ?? "");
  const [aiEnabled, setAiEnabled] = useState<boolean>(
    settings.assistant.enabled && settings.assistant.provider !== "offline-fallback",
  );

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<AssistantStatusPayload | null>(
    aiStatus,
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const activeProviderMeta =
    PROVIDER_OPTIONS.find((item) => item.id === provider) ?? PROVIDER_OPTIONS[0]!;

  const handleProviderSelect = (nextProvider: AssistantProviderKind) => {
    const meta = PROVIDER_OPTIONS.find((item) => item.id === nextProvider);
    setProvider(nextProvider);
    setAiEnabled(true);
    if (meta) {
      setEndpointUrl(meta.defaultUrl);
      setModel(meta.defaultModel);
    }
  };

  const buildDraftAssistantConfig = (): AssistantProviderConfig => ({
    provider: aiEnabled ? provider : "offline-fallback",
    endpointUrl: endpointUrl.trim() || activeProviderMeta.defaultUrl,
    model: model.trim() || activeProviderMeta.defaultModel,
    enabled: aiEnabled,
    ...(apiKey.trim() ? { apiKey: apiKey.trim() } : { apiKey: "" }),
  });

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const result = await onTestAiConnection(buildDraftAssistantConfig());
      setTestResult(result);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    onSave({
      engine,
      autoCompileOnPause,
      assistant: buildDraftAssistantConfig(),
    });
    onClose();
  };

  const displayStatus = testResult ?? aiStatus;

  return (
    <div
      className="tp-modal-backdrop"
      data-testid="settings-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="tp-settings-modal"
        data-testid="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Compiler and Local AI Settings"
      >
        <div className="tp-settings-header">
          <div>
            <h2 className="tp-settings-title">Compiler &amp; Local AI Settings</h2>
            <p className="tp-settings-subtitle">
              Configure TeX engine, pause-compile cadence, and 100% opt-in local endpoints.
            </p>
          </div>
          <button
            type="button"
            className="tp-icon-btn"
            data-testid="settings-close-btn"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="tp-settings-body">
          <section className="tp-settings-section">
            <div className="tp-settings-label-row">
              <span className="tp-settings-section-label">Compiler Engine</span>
              <span className="tp-settings-hint tabular-nums">
                Flags: -interaction=nonstopmode -file-line-error -synctex=1 -no-shell-escape
              </span>
            </div>
            <div className="tp-segmented" role="group" aria-label="Compiler engine">
              {ENGINE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`engine-option-${opt.id}`}
                  className={`tp-segmented-btn${engine === opt.id ? " active" : ""}`}
                  onClick={() => setEngine(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <label className="tp-settings-toggle-row">
              <input
                type="checkbox"
                data-testid="auto-compile-toggle"
                checked={autoCompileOnPause}
                onChange={(e) => setAutoCompileOnPause(e.target.checked)}
              />
              <span>Auto-Compile on Pause (Debounce 800ms)</span>
            </label>
          </section>

          <section className="tp-settings-section">
            <div className="tp-settings-label-row">
              <span className="tp-settings-section-label">
                AI Endpoint (100% On-Device Default)
              </span>
              <label className="tp-settings-inline-check">
                <input
                  type="checkbox"
                  data-testid="ai-enabled-toggle"
                  checked={aiEnabled}
                  onChange={(e) => setAiEnabled(e.target.checked)}
                />
                <span>Enabled</span>
              </label>
            </div>

            <div
              className="tp-segmented tp-settings-provider-group"
              role="group"
              aria-label="AI provider"
            >
              {PROVIDER_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`ai-provider-${opt.id}`}
                  className={`tp-segmented-btn${provider === opt.id ? " active" : ""}`}
                  onClick={() => handleProviderSelect(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="tp-settings-hint">{activeProviderMeta.hint}</p>

            <div className="tp-settings-grid">
              <label className="tp-settings-field">
                <span>Base URL</span>
                <input
                  type="text"
                  className="tp-input"
                  data-testid="settings-endpoint-input"
                  value={endpointUrl}
                  onChange={(e) => setEndpointUrl(e.target.value)}
                  disabled={!aiEnabled}
                  placeholder={activeProviderMeta.defaultUrl}
                />
              </label>
              <label className="tp-settings-field">
                <span>Model Name</span>
                <input
                  type="text"
                  className="tp-input"
                  data-testid="settings-model-input"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  disabled={!aiEnabled}
                  placeholder={activeProviderMeta.defaultModel}
                />
              </label>
            </div>

            {provider === "custom-openai" || provider === "gemini" ? (
              <label className="tp-settings-field">
                <span>
                  {provider === "gemini"
                    ? "Gemini API Key (Optional if GEMINI_API_KEY env is set)"
                    : "Bearer API Key (Optional)"}
                </span>
                <input
                  type="password"
                  className="tp-input"
                  data-testid="settings-apikey-input"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  disabled={!aiEnabled}
                  placeholder={provider === "gemini" ? "AIza..." : "sk-..."}
                  autoComplete="off"
                />
              </label>
            ) : null}

            <div className="tp-settings-probe-row">
              <button
                type="button"
                className="tp-icon-btn"
                data-testid="test-ai-connection-btn"
                onClick={() => void handleTestConnection()}
                disabled={testing}
              >
                {testing ? "Testing..." : "Test Connection"}
              </button>
              <span
                className="tp-settings-status-badge tabular-nums"
                data-testid="settings-ai-status"
                data-connected={displayStatus?.connected ? "true" : "false"}
              >
                {displayStatus?.statusLabel ?? "Not tested yet"}
              </span>
            </div>

            {displayStatus && displayStatus.availableModels.length > 0 ? (
              <div className="tp-settings-models-box" data-testid="settings-detected-models">
                <span className="tp-settings-hint">
                  Detected models ({String(displayStatus.availableModels.length)}):
                </span>
                <div className="tp-settings-model-chips">
                  {displayStatus.availableModels.map((modelId) => (
                    <button
                      key={modelId}
                      type="button"
                      className={`tp-model-chip${model === modelId ? " active" : ""}`}
                      onClick={() => setModel(modelId)}
                    >
                      {modelId}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        </div>

        <div className="tp-settings-footer">
          <button type="button" className="tp-icon-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="tp-primary-btn"
            data-testid="settings-save-btn"
            onClick={handleSave}
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
