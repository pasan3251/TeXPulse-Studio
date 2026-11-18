import { DEFAULT_PROJECT_FILES, type DiagnosticItem } from "@texpulse/shared";
import { describe, expect, it } from "vitest";
import { AssistantService } from "../assistant/assistant-service.js";
import type { ProcessRunner } from "./process-runner.js";
import {
  TexCountService,
  computeAstTexCount,
  parseTexCountOutput,
} from "./texcount-service.js";

describe("Phase 4 TexCountService & AssistantService", () => {
  it("parses texcount -sub=section output and maps sections back to workspace files", async () => {
    const sampleStdout = [
      "File: main.tex",
      "Words in text: 92",
      "Words in headers: 18",
      "Words outside text (captions, etc.): 0",
      "Number of headers: 6",
      "Number of floats/tables/figures: 0",
      "Number of math inlines: 5",
      "Number of math displayed: 3",
      "Subcounts:",
      "  text+headers+captions (#headers/#floats/#inlines/#displayed)",
      "  0+7+0 (1/0/0/0) _top_",
      "  39+3+0 (2/0/1/1) Section: Introduction",
      "  22+6+0 (2/0/1/1) Section: Hamiltonian Error Mitigation",
      "  31+2+0 (1/0/3/1) Section: Zero-Noise Extrapolation",
    ].join("\n");

    const parsed = parseTexCountOutput(sampleStdout, DEFAULT_PROJECT_FILES, "main.tex");
    expect(parsed).not.toBeNull();
    expect(parsed?.source).toBe("texcount");
    expect(parsed?.wordsInText).toBe(92);
    expect(parsed?.wordsInHeaders).toBe(18);
    expect(parsed?.mathInlines).toBe(5);
    expect(parsed?.mathDisplay).toBe(3);
    expect(parsed?.sections).toHaveLength(4);
    expect(parsed?.sections[3]).toMatchObject({
      title: "Zero-Noise Extrapolation",
      wordsInText: 31,
      filePath: "chapters/methodology.tex",
      line: 1,
    });

    // Falls back deterministically to TypeScript AST counter when texcount CLI is missing
    const failingRunner: ProcessRunner = {
      run: async () => {
        throw new Error("ENOENT");
      },
    };
    const service = new TexCountService(process.cwd(), { processRunner: failingRunner });
    const fallbackCounts = await service.count({
      rootFile: "main.tex",
      files: DEFAULT_PROJECT_FILES,
    });
    expect(fallbackCounts.source).toBe("ast-fallback");
    expect(fallbackCounts.wordsInText).toBeGreaterThan(50);
    expect(fallbackCounts.sections.some((s) => s.filePath === "chapters/methodology.tex")).toBe(
      true,
    );

    const astOnly = computeAstTexCount("main.tex", DEFAULT_PROJECT_FILES);
    expect(astOnly.totalWords).toBe(astOnly.wordsInText + astOnly.wordsInHeaders + astOnly.wordsInCaptions);
  });

  it("builds contract-anchored prompts and repairs/synthesizes offline and online via IAssistantService", async () => {
    const offlineAssistant = new AssistantService({
      fetchFn: async () => {
        throw new Error("ECONNREFUSED");
      },
      env: {},
    });

    const status = await offlineAssistant.getStatus();
    expect(status.connected).toBe(false);
    expect(status.statusLabel).toContain("Offline: Start Ollama/LM Studio");

    const diag: DiagnosticItem = {
      id: "latex-log:undefined-control-sequence:main.tex:10:0",
      severity: "error",
      category: "error",
      source: "latex-log",
      file: "main.tex",
      line: 10,
      message: "Undefined control sequence.",
      humanTitle: "Undefined command: \\badmacro",
      explanation: "Unrecognized macro \\badmacro.",
      rawLog: "main.tex:10: Undefined control sequence.\nl.10 Test \\badmacro{text}",
      ruleId: "undefined-control-sequence",
    };

    const prompt = offlineAssistant.buildContextAnchoredPrompt({
      filePath: "main.tex",
      line: 10,
      currentSection: "Introduction",
      activeEnvironment: null,
      loadedPackages: ["amsmath", "amssymb"],
      surroundingLines: "9: \\maketitle\n> 10: Test \\badmacro{text}\n11: Done",
      validLabels: ["sec:intro"],
      validCitationKeys: ["preskill2018nisq"],
      diagnostic: diag,
    });
    expect(prompt).toContain("Current Section: Introduction");
    expect(prompt).toContain("Loaded Packages: amsmath, amssymb");
    expect(prompt).toContain("Valid \\label keys: sec:intro");
    expect(prompt).toContain("Valid \\cite keys: preskill2018nisq");

    const proposal = await offlineAssistant.proposeErrorFix({
      filePath: "main.tex",
      line: 10,
      currentSection: "Introduction",
      activeEnvironment: null,
      loadedPackages: ["amsmath", "amssymb"],
      surroundingLines: "9: \\maketitle\n> 10: Test \\badmacro{text}\n11: Done",
      validLabels: ["sec:intro"],
      validCitationKeys: ["preskill2018nisq"],
      diagnostic: diag,
    });
    expect(proposal.provider).toBe("offline-fallback");
    expect(proposal.originalSnippet).toBe("Test \\badmacro{text}");
    expect(proposal.replacementSnippet).toBe("Test text");
    expect(proposal.unifiedDiff).toContain("- Test \\badmacro{text}");
    expect(proposal.unifiedDiff).toContain("+ Test text");

    // Table generation & CSV conversion
    const csvTable = await offlineAssistant.generateInlineLatex({
      filePath: "main.tex",
      line: 12,
      currentSection: "Results",
      activeEnvironment: null,
      loadedPackages: ["amsmath", "booktabs"],
      surroundingLines: "",
      validLabels: [],
      validCitationKeys: [],
      instruction: "Engine,TimeMs,Cache\nlatexmk,17202,no\nfmt,698,yes",
    });
    expect(csvTable.mode).toBe("latex-insert");
    expect(csvTable.latex).toContain("\\toprule");
    expect(csvTable.latex).toContain("Engine & TimeMs & Cache \\\\");

    // Smart @cite local match & CrossRef/stub generation
    const localCite = await offlineAssistant.generateInlineLatex({
      filePath: "main.tex",
      line: 12,
      currentSection: null,
      activeEnvironment: null,
      loadedPackages: [],
      surroundingLines: "",
      validLabels: [],
      validCitationKeys: ["preskill2018nisq"],
      instruction: "@cite preskill quantum",
    });
    expect(localCite.mode).toBe("citation-insert");
    expect(localCite.latex).toBe("~\\cite{preskill2018nisq}");

    // Connected Ollama mock test
    const ollamaAssistant = new AssistantService({
      fetchFn: async (input) => {
        const url = String(input);
        if (url.endsWith("/models")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ data: [{ id: "qwen2.5-coder:7b" }] }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: "Fixed \\textbf{text}" } }],
          }),
        };
      },
      env: {},
    });
    const connected = await ollamaAssistant.getStatus();
    expect(connected.connected).toBe(true);
    expect(connected.statusLabel).toBe("Connected: Local Ollama");
    const onlineFix = await ollamaAssistant.proposeErrorFix({
      filePath: "main.tex",
      line: 10,
      currentSection: null,
      activeEnvironment: null,
      loadedPackages: [],
      surroundingLines: "> 10: Test \\badmacro{text}",
      validLabels: [],
      validCitationKeys: [],
      diagnostic: diag,
    });
    expect(onlineFix.provider).toBe("ollama");
    expect(onlineFix.replacementSnippet).toBe("Fixed \\textbf{text}");
  });
});
