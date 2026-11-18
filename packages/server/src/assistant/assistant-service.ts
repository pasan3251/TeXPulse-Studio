import type {
  AssistantProviderConfig,
  AssistantStatusPayload,
  ContextAnchoredPromptInput,
  ErrorFixProposal,
  IAssistantService,
  InlineGenerationResult,
} from "@texpulse/shared";

const LOCAL_PROBE_TIMEOUT_MS = 800;
const INFERENCE_TIMEOUT_MS = 15_000;
const CROSSREF_TIMEOUT_MS = 2_500;

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export interface AssistantServiceDependencies {
  fetchFn?: FetchLike | undefined;
  env?: Readonly<Record<string, string | undefined>> | undefined;
}

function buildLineDiff(
  filePath: string,
  startLine: number,
  originalSnippet: string,
  replacementSnippet: string,
): string {
  const oldLines = originalSnippet.split(/\r?\n/u);
  const newLines = replacementSnippet.split(/\r?\n/u);
  return [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -${String(startLine)},${String(oldLines.length)} +${String(startLine)},${String(newLines.length)} @@`,
    ...oldLines.map((l) => `- ${l}`),
    ...newLines.map((l) => `+ ${l}`),
  ].join("\n");
}

function detectCsvRows(instruction: string): string[][] | null {
  const lines = instruction
    .split(/\r?\n/u)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;
  const rows = lines.map((line) => line.split(",").map((cell) => cell.trim()));
  const colCount = rows[0]?.length ?? 0;
  if (colCount < 2 || !rows.every((r) => r.length === colCount)) {
    return null;
  }
  return rows;
}

function buildBooktabsTableFromCsv(rows: string[][], caption = "Tabular comparison"): string {
  const cols = rows[0]!.length;
  const align = `l${"r".repeat(Math.max(0, cols - 1))}`;
  const header = `${rows[0]!.join(" & ")} \\\\`;
  const bodyRows = rows.slice(1).map((r) => `${r.join(" & ")} \\\\`);
  return [
    "\\begin{table}[htbp]",
    "  \\centering",
    `  \\caption{${caption}}`,
    `  \\begin{tabular}{${align}}`,
    "    \\toprule",
    `    ${header}`,
    "    \\midrule",
    ...bodyRows.map((row) => `    ${row}`),
    "    \\bottomrule",
    "  \\end{tabular}",
    "\\end{table}",
  ].join("\n");
}

function buildGeneratedTable(instruction: string, loadedPackages: readonly string[]): string {
  const dimMatch = /(\d+)\s*[x×by]+\s*(\d+)/iu.exec(instruction);
  const rows = Math.min(8, Math.max(2, Number.parseInt(dimMatch?.[1] ?? "3", 10)));
  const cols = Math.min(6, Math.max(2, Number.parseInt(dimMatch?.[2] ?? "4", 10)));
  const useBooktabs = loadedPackages.includes("booktabs") || /booktabs/iu.test(instruction);

  const align = `l${"c".repeat(cols - 1)}`;
  const headers = Array.from({ length: cols }, (_, c) =>
    c === 0 ? "Metric" : `Config ${String(c)}`,
  ).join(" & ");
  const body = Array.from({ length: Math.max(1, rows - 1) }, (_, r) =>
    Array.from({ length: cols }, (_, c) => (c === 0 ? `Item ${String(r + 1)}` : "--")).join(
      " & ",
    ),
  ).map((line) => `    ${line} \\\\`);

  return [
    "\\begin{table}[htbp]",
    "  \\centering",
    `  \\caption{${instruction.trim()}}`,
    `  \\begin{tabular}{${align}}`,
    `    ${useBooktabs ? "\\toprule" : "\\hline"}`,
    `    ${headers} \\\\`,
    `    ${useBooktabs ? "\\midrule" : "\\hline"}`,
    ...body,
    `    ${useBooktabs ? "\\bottomrule" : "\\hline"}`,
    "  \\end{tabular}",
    "\\end{table}",
  ].join("\n");
}

function slugifyCitationKey(author: string, year: string, title: string): string {
  const lastName =
    author
      .split(/[, ]+/u)
      .filter(Boolean)[0]
      ?.toLowerCase()
      .replace(/[^a-z0-9]/gu, "") ?? "ref";
  const firstWord =
    title
      .split(/\s+/u)
      .find((w) => w.length > 3)
      ?.toLowerCase()
      .replace(/[^a-z0-9]/gu, "") ?? "work";
  return `${lastName}${year}${firstWord}`;
}

export class AssistantService implements IAssistantService {
  private readonly fetchFn: FetchLike;
  private readonly env: Readonly<Record<string, string | undefined>>;
  private config: AssistantProviderConfig = {
    provider: "ollama",
    endpointUrl: "http://127.0.0.1:11434/v1",
    model: "qwen2.5-coder:7b",
    enabled: true,
  };

  constructor(deps: AssistantServiceDependencies = {}) {
    this.fetchFn = deps.fetchFn ?? ((input, init) => fetch(input, init));
    this.env = deps.env ?? process.env;
  }

  /**
   * Builds a strictly bounded, contract-anchored prompt from `IDocumentContextProvider`
   * snapshots (never dumping full-project sources).
   */
  buildContextAnchoredPrompt(input: ContextAnchoredPromptInput): string {
    const sections: string[] = [
      "You are TeXPulse Studio 2.0 LaTeX Assistant.",
      `File: ${input.filePath}:${String(input.line)}`,
      `Current Section: ${input.currentSection ?? "(top-level)"}`,
      `Active Environment: ${input.activeEnvironment ?? "(document body)"}`,
      `Loaded Packages: ${input.loadedPackages.length > 0 ? input.loadedPackages.join(", ") : "none"}`,
      `Valid \\label keys: ${input.validLabels.slice(0, 20).join(", ") || "none"}`,
      `Valid \\cite keys: ${input.validCitationKeys.slice(0, 20).join(", ") || "none"}`,
    ];

    if (input.diagnostic) {
      sections.push(
        `Diagnostic [${input.diagnostic.category}]: ${input.diagnostic.humanTitle}`,
        `Explanation: ${input.diagnostic.explanation}`,
        `Raw Log:\n${input.diagnostic.rawLog.slice(0, 500)}`,
      );
    }

    if (input.instruction) {
      sections.push(`User Instruction: ${input.instruction}`);
    }

    sections.push(`Surrounding Source Lines:\n${input.surroundingLines}`);
    return sections.join("\n\n");
  }

  async configure(
    next: Partial<AssistantProviderConfig>,
  ): Promise<AssistantStatusPayload> {
    const resolvedApiKey =
      next.apiKey !== undefined
        ? next.apiKey.trim() || undefined
        : this.config.apiKey;
    if (next.provider) {
      const defaultUrl =
        next.provider === "lmstudio"
          ? "http://127.0.0.1:1234/v1"
          : next.provider === "gemini"
            ? "https://generativelanguage.googleapis.com/v1beta"
            : next.provider === "custom-openai"
              ? this.config.endpointUrl || "http://127.0.0.1:8080/v1"
              : "http://127.0.0.1:11434/v1";
      this.config = {
        ...this.config,
        ...next,
        endpointUrl: next.endpointUrl?.trim() || defaultUrl,
        apiKey: resolvedApiKey,
      };
    } else {
      this.config = {
        ...this.config,
        ...next,
        ...(next.endpointUrl !== undefined
          ? { endpointUrl: next.endpointUrl.trim() || this.config.endpointUrl }
          : {}),
        apiKey: resolvedApiKey,
      };
    }
    return this.getStatus();
  }

  async getStatus(): Promise<AssistantStatusPayload> {
    if (!this.config.enabled || this.config.provider === "offline-fallback") {
      return {
        connected: false,
        provider: "offline-fallback",
        model: "deterministic-ast",
        endpointUrl: this.config.endpointUrl,
        statusLabel: "Offline: Deterministic Local Mode",
        availableModels: [],
      };
    }

    if (this.config.provider === "gemini") {
      const hasKey = Boolean(
        this.config.apiKey?.trim() || this.env.GEMINI_API_KEY?.trim(),
      );
      return {
        connected: hasKey,
        provider: hasKey ? "gemini" : "offline-fallback",
        model: this.config.model || "gemini-2.5-flash",
        endpointUrl: this.config.endpointUrl,
        statusLabel: hasKey
          ? `Connected: Gemini (${this.config.model || "gemini-2.5-flash"})`
          : "Offline: Set GEMINI_API_KEY",
        availableModels: hasKey ? ["gemini-2.5-flash", "gemini-2.5-pro"] : [],
      };
    }

    const endpointsToProbe: Array<{
      provider: "ollama" | "lmstudio" | "custom-openai";
      baseUrl: string;
      label: string;
    }> =
      this.config.provider === "lmstudio"
        ? [{ provider: "lmstudio", baseUrl: this.config.endpointUrl, label: "Connected: Local LM Studio" }]
        : this.config.provider === "custom-openai"
          ? [{ provider: "custom-openai", baseUrl: this.config.endpointUrl, label: "Connected: Custom OpenAI Endpoint" }]
          : [
              { provider: "ollama", baseUrl: this.config.endpointUrl, label: "Connected: Local Ollama" },
              { provider: "lmstudio", baseUrl: "http://127.0.0.1:1234/v1", label: "Connected: Local LM Studio" },
            ];

    for (const candidate of endpointsToProbe) {
      const models = await this.probeOpenAiModels(candidate.baseUrl, this.config.apiKey);
      if (models !== null) {
        const selectedModel =
          this.config.model && models.includes(this.config.model)
            ? this.config.model
            : (models[0] ?? this.config.model);
        return {
          connected: true,
          provider: candidate.provider,
          model: selectedModel,
          endpointUrl: candidate.baseUrl,
          statusLabel: candidate.label,
          availableModels: models,
        };
      }
    }

    return {
      connected: false,
      provider: this.config.provider,
      model: this.config.model,
      endpointUrl: this.config.endpointUrl,
      statusLabel:
        this.config.provider === "custom-openai"
          ? "Offline: Check Custom OpenAI URL"
          : "Offline: Start Ollama/LM Studio",
      availableModels: [],
    };
  }

  async proposeErrorFix(
    input: ContextAnchoredPromptInput,
  ): Promise<ErrorFixProposal> {
    const prompt = this.buildContextAnchoredPrompt(input);
    const status = await this.getStatus();

    if (
      status.connected &&
      (status.provider === "ollama" ||
        status.provider === "lmstudio" ||
        status.provider === "custom-openai")
    ) {
      const completion = await this.callOpenAiChat(
        status.endpointUrl,
        status.model,
        `${prompt}\n\nReturn ONLY the corrected replacement lines for the failing snippet without markdown fences or prose.`,
        this.config.apiKey,
      );
      if (completion) {
        const cleaned = stripMarkdownFences(completion);
        return {
          provider: status.provider,
          summary: `Proposed fix via ${status.statusLabel}`,
          targetFile: input.filePath,
          startLine: Math.max(1, input.line),
          endLine: Math.max(1, input.line),
          originalSnippet: extractFocusLine(input.surroundingLines),
          replacementSnippet: cleaned,
          unifiedDiff: buildLineDiff(
            input.filePath,
            Math.max(1, input.line),
            extractFocusLine(input.surroundingLines),
            cleaned,
          ),
        };
      }
    } else if (status.connected && status.provider === "gemini") {
      const completion = await this.callGeminiGenerate(
        status.model,
        `${prompt}\n\nReturn ONLY the corrected replacement lines for the failing snippet without markdown fences.`,
      );
      if (completion) {
        const cleaned = stripMarkdownFences(completion);
        return {
          provider: "gemini",
          summary: `Proposed fix via Gemini`,
          targetFile: input.filePath,
          startLine: Math.max(1, input.line),
          endLine: Math.max(1, input.line),
          originalSnippet: extractFocusLine(input.surroundingLines),
          replacementSnippet: cleaned,
          unifiedDiff: buildLineDiff(
            input.filePath,
            Math.max(1, input.line),
            extractFocusLine(input.surroundingLines),
            cleaned,
          ),
        };
      }
    }

    return this.synthesizeDeterministicFix(input);
  }

  async generateInlineLatex(
    input: ContextAnchoredPromptInput,
  ): Promise<InlineGenerationResult> {
    const instruction = (input.instruction ?? "").trim();
    const citeMatch = /^@cite\s+(.+)$/iu.exec(instruction);
    if (citeMatch?.[1]) {
      return this.resolveSmartCitation(citeMatch[1].trim(), input.validCitationKeys);
    }

    const csvRows = detectCsvRows(instruction);
    if (csvRows !== null) {
      return {
        provider: "offline-fallback",
        mode: "latex-insert",
        summary: `Converted ${String(csvRows.length)}×${String(csvRows[0]!.length)} CSV data into a booktabs LaTeX table.`,
        latex: buildBooktabsTableFromCsv(csvRows),
      };
    }

    const status = await this.getStatus();
    const prompt = this.buildContextAnchoredPrompt(input);

    if (
      status.connected &&
      (status.provider === "ollama" ||
        status.provider === "lmstudio" ||
        status.provider === "custom-openai")
    ) {
      const completion = await this.callOpenAiChat(
        status.endpointUrl,
        status.model,
        `${prompt}\n\nGenerate ONLY valid LaTeX code matching loaded packages (${input.loadedPackages.join(", ")}). Do not include explanations or code fences.`,
        this.config.apiKey,
      );
      if (completion) {
        return {
          provider: status.provider,
          mode: "latex-insert",
          summary: `Generated via ${status.statusLabel}`,
          latex: stripMarkdownFences(completion),
        };
      }
    } else if (status.connected && status.provider === "gemini") {
      const completion = await this.callGeminiGenerate(
        status.model,
        `${prompt}\n\nGenerate ONLY valid LaTeX code without code fences or commentary.`,
      );
      if (completion) {
        return {
          provider: "gemini",
          mode: "latex-insert",
          summary: "Generated via Gemini",
          latex: stripMarkdownFences(completion),
        };
      }
    }

    return this.synthesizeDeterministicInlineLatex(instruction, input.loadedPackages);
  }

  private async resolveSmartCitation(
    topic: string,
    existingKeys: readonly string[],
  ): Promise<InlineGenerationResult> {
    const lowerTopic = topic.toLowerCase();
    const matchingExisting = existingKeys.find((k) =>
      lowerTopic.split(/\s+/u).some((tok) => tok.length > 2 && k.toLowerCase().includes(tok)),
    );
    if (matchingExisting && existingKeys.includes(matchingExisting)) {
      return {
        provider: "offline-fallback",
        mode: "citation-insert",
        summary: `Matched existing workspace BibTeX entry "${matchingExisting}".`,
        latex: `~\\cite{${matchingExisting}}`,
        citationKey: matchingExisting,
      };
    }

    // Try CrossRef REST API cleanly with short timeout when online
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), CROSSREF_TIMEOUT_MS);
      const url = `https://api.crossref.org/works?rows=1&query=${encodeURIComponent(topic)}`;
      const res = await this.fetchFn(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = (await res.json()) as {
          message?: {
            items?: Array<{
              title?: string[];
              author?: Array<{ given?: string; family?: string }>;
              published?: { "date-parts"?: number[][] };
              "container-title"?: string[];
              DOI?: string;
            }>;
          };
        };
        const work = data.message?.items?.[0];
        if (work) {
          const title = work.title?.[0] ?? topic;
          const authors =
            work.author
              ?.slice(0, 3)
              .map((a) => `${a.given ?? ""} ${a.family ?? ""}`.trim())
              .filter(Boolean)
              .join(" and ") || "Research Authors";
          const year = String(work.published?.["date-parts"]?.[0]?.[0] ?? 2024);
          const journal = work["container-title"]?.[0] ?? "Preprint";
          const key = slugifyCitationKey(work.author?.[0]?.family ?? authors, year, title);
          const bibEntry = [
            `@article{${key},`,
            `  author  = {${authors}},`,
            `  title   = {${title}},`,
            `  journal = {${journal}},`,
            `  year    = {${year}}${work.DOI ? `,\n  doi     = {${work.DOI}}` : ""}`,
            "}",
          ].join("\n");
          return {
            provider: "offline-fallback",
            mode: "citation-insert",
            summary: `Fetched CrossRef metadata and generated BibTeX entry "${key}".`,
            latex: `~\\cite{${key}}`,
            bibEntry,
            citationKey: key,
          };
        }
      }
    } catch {
      // Offline / blocked network falls back cleanly to local BibTeX synthesis
    }

    const sanitizedWord =
      topic
        .split(/\s+/u)
        .find((w) => w.length > 2)
        ?.toLowerCase()
        .replace(/[^a-z0-9]/gu, "") || "topic";
    const key = `${sanitizedWord}2025note`;
    const bibEntry = [
      `@article{${key},`,
      `  author  = {Author Name},`,
      `  title   = {${topic}},`,
      `  journal = {Journal of Quantum Systems},`,
      `  year    = {2025}`,
      "}",
    ].join("\n");

    return {
      provider: "offline-fallback",
      mode: "citation-insert",
      summary: `Synthesized BibTeX stub "${key}" and inserted citation command.`,
      latex: `~\\cite{${key}}`,
      bibEntry,
      citationKey: key,
    };
  }

  private synthesizeDeterministicFix(
    input: ContextAnchoredPromptInput,
  ): ErrorFixProposal {
    const diag = input.diagnostic;
    const focusLine = extractFocusLine(input.surroundingLines);
    const targetLine = Math.max(1, input.line);

    if (diag?.quickFix?.type === "insert-package") {
      const pkg = diag.quickFix.packageName;
      return {
        provider: "offline-fallback",
        summary: `Add missing \\usepackage{${pkg}} or wrap command cleanly.`,
        targetFile: input.filePath,
        startLine: targetLine,
        endLine: targetLine,
        originalSnippet: focusLine,
        replacementSnippet:
          pkg === "booktabs" && /\\toprule\b/u.test(focusLine)
            ? focusLine.replace(/\\toprule\b/gu, "\\hline")
            : focusLine,
        unifiedDiff: buildLineDiff(
          input.filePath,
          targetLine,
          focusLine,
          pkg === "booktabs" && /\\toprule\b/u.test(focusLine)
            ? focusLine.replace(/\\toprule\b/gu, "\\hline")
            : focusLine,
        ),
      };
    }

    if (diag?.ruleId === "undefined-control-sequence") {
      const cmdMatch = /Undefined command:\s*(\\[A-Za-z@]+)/iu.exec(diag.humanTitle)
        ?? /(\\[A-Za-z@]+)/u.exec(diag.rawLog);
      const badCmd = cmdMatch?.[1];
      let fixed = focusLine;
      if (badCmd && focusLine.includes(badCmd)) {
        const escaped = badCmd.replace("\\", "\\\\");
        fixed = focusLine.replace(new RegExp(`${escaped}(?:\\{([^}]*)\\})?`, "gu"), (_m, arg: string | undefined) =>
          arg ? arg : `% Removed undefined macro ${badCmd}`,
        );
      } else {
        fixed = `% Resolved error on line ${String(targetLine)}: ${focusLine}`;
      }
      if (fixed === focusLine) {
        fixed = focusLine.replace(/\\[A-Za-z@]+/u, "\\textbf");
      }
      return {
        provider: "offline-fallback",
        summary: `Replaced undefined macro ${badCmd ?? "control sequence"} with valid LaTeX.`,
        targetFile: input.filePath,
        startLine: targetLine,
        endLine: targetLine,
        originalSnippet: focusLine,
        replacementSnippet: fixed,
        unifiedDiff: buildLineDiff(input.filePath, targetLine, focusLine, fixed),
      };
    }

    if (diag?.ruleId === "missing-dollar") {
      const mathTokenMatch = /([A-Za-z0-9_]+(?:\^|_)\{?[A-Za-z0-9+-]+\}?)/u.exec(focusLine);
      const fixed = mathTokenMatch?.[1]
        ? focusLine.replace(mathTokenMatch[1], `$${mathTokenMatch[1]}$`)
        : `$${focusLine}$`;
      return {
        provider: "offline-fallback",
        summary: "Wrapped math expression in inline `$ ... $` delimiters.",
        targetFile: input.filePath,
        startLine: targetLine,
        endLine: targetLine,
        originalSnippet: focusLine,
        replacementSnippet: fixed,
        unifiedDiff: buildLineDiff(input.filePath, targetLine, focusLine, fixed),
      };
    }

    const fixed = `% Check syntax: ${focusLine}`;
    return {
      provider: "offline-fallback",
      summary: "Commented failing line pending manual review.",
      targetFile: input.filePath,
      startLine: targetLine,
      endLine: targetLine,
      originalSnippet: focusLine,
      replacementSnippet: fixed,
      unifiedDiff: buildLineDiff(input.filePath, targetLine, focusLine, fixed),
    };
  }

  private synthesizeDeterministicInlineLatex(
    instruction: string,
    loadedPackages: readonly string[],
  ): InlineGenerationResult {
    const lower = instruction.toLowerCase();
    if (lower.includes("maxwell")) {
      return {
        provider: "offline-fallback",
        mode: "latex-insert",
        summary: "Inserted Maxwell's equations in an align block.",
        latex: [
          "\\begin{align}",
          "  \\nabla \\cdot \\mathbf{E} &= \\frac{\\rho}{\\varepsilon_0}, &",
          "  \\nabla \\cdot \\mathbf{B} &= 0, \\\\",
          "  \\nabla \\times \\mathbf{E} &= -\\frac{\\partial \\mathbf{B}}{\\partial t}, &",
          "  \\nabla \\times \\mathbf{B} &= \\mu_0 \\mathbf{J} + \\mu_0 \\varepsilon_0 \\frac{\\partial \\mathbf{E}}{\\partial t}",
          "\\end{align}",
        ].join("\n"),
      };
    }

    if (lower.includes("matrix") || lower.includes("pauli")) {
      return {
        provider: "offline-fallback",
        mode: "latex-insert",
        summary: "Inserted 2×2 matrix expression using amsmath bmatrix.",
        latex: [
          "\\begin{equation}",
          "  U = \\begin{bmatrix}",
          "    \\cos(\\theta / 2) & -i \\sin(\\theta / 2) \\\\",
          "    -i \\sin(\\theta / 2) & \\cos(\\theta / 2)",
          "  \\end{bmatrix}",
          "\\end{equation}",
        ].join("\n"),
      };
    }

    if (lower.includes("table") || lower.includes("booktabs") || /\d+\s*[x×]\s*\d+/iu.test(lower)) {
      return {
        provider: "offline-fallback",
        mode: "latex-insert",
        summary: "Synthesized LaTeX table skeleton from prompt dimensions.",
        latex: buildGeneratedTable(instruction, loadedPackages),
      };
    }

    return {
      provider: "offline-fallback",
      mode: "latex-insert",
      summary: "Inserted aligned equation template.",
      latex: [
        "\\begin{align}",
        `  % ${instruction}`,
        "  f(x) &= \\sum_{i=1}^{n} w_i \\phi_i(x)",
        "\\end{align}",
      ].join("\n"),
    };
  }

  private async probeOpenAiModels(baseUrl: string, apiKey?: string): Promise<string[] | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOCAL_PROBE_TIMEOUT_MS);
    try {
      const cleanBase = baseUrl.replace(/\/+$/u, "");
      const headers: Record<string, string> = {};
      if (apiKey?.trim()) {
        headers.Authorization = `Bearer ${apiKey.trim()}`;
      }
      const res = await this.fetchFn(`${cleanBase}/models`, {
        method: "GET",
        headers,
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { data?: Array<{ id?: string }> };
      const models = (data.data ?? [])
        .map((m) => m.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0);
      return models;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private async callOpenAiChat(
    baseUrl: string,
    model: string,
    prompt: string,
    apiKey?: string,
  ): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), INFERENCE_TIMEOUT_MS);
    try {
      const cleanBase = baseUrl.replace(/\/+$/u, "");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey?.trim()) {
        headers.Authorization = `Bearer ${apiKey.trim()}`;
      }
      const res = await this.fetchFn(`${cleanBase}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          temperature: 0.1,
          messages: [
            { role: "system", content: "Output ONLY raw LaTeX without markdown fences." },
            { role: "user", content: prompt },
          ],
        }),
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content?.trim();
      return text && text.length > 0 ? text : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private async callGeminiGenerate(model: string, prompt: string): Promise<string | null> {
    const apiKey = this.config.apiKey?.trim() || this.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), INFERENCE_TIMEOUT_MS);
    try {
      const cleanBase = this.config.endpointUrl.replace(/\/+$/u, "");
      const url = `${cleanBase}/models/${encodeURIComponent(model || "gemini-2.5-flash")}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await this.fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1 },
        }),
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      return text && text.length > 0 ? text : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```(?:latex|tex|bibtex)?\s*\r?\n?/iu, "")
    .replace(/\r?\n?```$/u, "")
    .trim();
}

function extractFocusLine(surroundingLines: string): string {
  const lines = surroundingLines.split(/\r?\n/u);
  const marked = lines.find((l) => l.startsWith("> "));
  const candidate = marked
    ? marked.slice(2)
    : (lines[Math.floor(lines.length / 2)] ?? lines[0] ?? "");
  return candidate.replace(/^\d+:\s*/u, "");
}
