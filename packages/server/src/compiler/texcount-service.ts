import type {
  ProjectFile,
  TexCountResultPayload,
  TexCountSectionBreakdown,
} from "@texpulse/shared";
import { normalizeProjectPath } from "../project-store.js";
import { NodeProcessRunner, type ProcessRunner } from "./process-runner.js";

const TEXCOUNT_TIMEOUT_MS = 10_000;

export interface TexCountRequest {
  rootFile: string;
  files?: readonly ProjectFile[] | undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function findSectionLocation(
  sectionTitle: string,
  files: readonly ProjectFile[],
  fallbackFile: string,
): { filePath: string; line: number } {
  const cleanTitle = sectionTitle.trim();
  if (!cleanTitle || cleanTitle === "_top_") {
    return { filePath: fallbackFile, line: 1 };
  }

  const pattern = new RegExp(
    `\\\\(?:part|chapter|section|subsection|subsubsection)\\*?\\{\\s*${escapeRegExp(cleanTitle)}\\s*\\}`,
    "u",
  );
  for (const file of files) {
    if (!file.path.toLowerCase().endsWith(".tex")) continue;
    const lines = file.content.split(/\r?\n/u);
    for (let i = 0; i < lines.length; i += 1) {
      if (pattern.test(lines[i] ?? "")) {
        return { filePath: file.path, line: i + 1 };
      }
    }
  }
  return { filePath: fallbackFile, line: 1 };
}

function computeBodyCharacters(files: readonly ProjectFile[]): number {
  let chars = 0;
  for (const file of files) {
    if (!file.path.toLowerCase().endsWith(".tex")) continue;
    const stripped = file.content.replace(/(^|[^\\])%.*$/gmu, "$1").trim();
    chars += stripped.replace(/\s+/gu, " ").length;
  }
  return chars;
}

/**
 * Parses `texcount -sub=section -merge -utf8` standard output into structured
 * summary counts and per-section rows.
 */
export function parseTexCountOutput(
  stdout: string,
  files: readonly ProjectFile[],
  rootFile: string,
): TexCountResultPayload | null {
  const wordsTextMatch = /Words in text:\s*(\d+)/iu.exec(stdout);
  if (!wordsTextMatch?.[1]) return null;

  const wordsInText = Number.parseInt(wordsTextMatch[1], 10);
  const wordsInHeaders = Number.parseInt(
    /Words in headers:\s*(\d+)/iu.exec(stdout)?.[1] ?? "0",
    10,
  );
  const wordsInCaptions = Number.parseInt(
    /Words (?:outside text|in captions)[^:]*:\s*(\d+)/iu.exec(stdout)?.[1] ?? "0",
    10,
  );
  const mathInlines = Number.parseInt(
    /Number of math inlines:\s*(\d+)/iu.exec(stdout)?.[1] ?? "0",
    10,
  );
  const mathDisplay = Number.parseInt(
    /Number of math displayed:\s*(\d+)/iu.exec(stdout)?.[1] ?? "0",
    10,
  );

  const sections: TexCountSectionBreakdown[] = [];
  const subcountRe =
    /^\s*(\d+)\+(\d+)\+(\d+)\s+\((\d+)\/(\d+)\/(\d+)\/(\d+)\)\s+(.+)$/u;

  for (const rawLine of stdout.split(/\r?\n/u)) {
    const match = subcountRe.exec(rawLine);
    if (!match) continue;
    const secText = Number.parseInt(match[1]!, 10);
    const secHeaders = Number.parseInt(match[2]!, 10);
    const secCaptions = Number.parseInt(match[3]!, 10);
    const secInlines = Number.parseInt(match[6]!, 10);
    const secDisplay = Number.parseInt(match[7]!, 10);
    const rawLabel = match[8]!.trim();

    const cleanedTitle = rawLabel
      .replace(/^(?:Section|Subsection|Subsubsection|Chapter|Part):\s*/iu, "")
      .trim();
    const displayTitle =
      cleanedTitle === "_top_" ? "Title & Preamble" : cleanedTitle;
    const loc = findSectionLocation(cleanedTitle, files, rootFile);

    sections.push({
      title: displayTitle,
      wordsInText: secText,
      wordsInHeaders: secHeaders,
      wordsInCaptions: secCaptions,
      mathInlines: secInlines,
      mathDisplay: secDisplay,
      filePath: loc.filePath,
      line: loc.line,
    });
  }

  return {
    source: "texcount",
    wordsInText,
    wordsInHeaders,
    wordsInCaptions,
    totalWords: wordsInText + wordsInHeaders + wordsInCaptions,
    mathInlines,
    mathDisplay,
    characterCount: computeBodyCharacters(files),
    sections,
  };
}

function countProseWords(fragment: string): number {
  const cleaned = fragment
    .replace(/(^|[^\\])%.*$/gmu, "$1")
    .replace(/\\(?:label|ref|eqref|autoref|cref|Cref|cite|citep|citet|bibliographystyle|bibliography|usepackage|documentclass|input|include|begin|end)\b(?:\[[^\]]*\])?(?:\{[^}]*\})?/gu, " ")
    .replace(/\\(?:textbf|textit|emph|underline|texttt|mathrm)\{([^}]*)\}/gu, " $1 ")
    .replace(/\\[A-Za-z@]+\*?/gu, " ")
    .replace(/[{}\[\]$&~^_\\]/gu, " ");

  const tokens = cleaned.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/gu);
  return tokens?.length ?? 0;
}

/**
 * Pure-TypeScript AST/regex TeX word & math counter used automatically if the
 * Perl `texcount` executable is missing or exits non-zero.
 */
export function computeAstTexCount(
  rootFile: string,
  files: readonly ProjectFile[],
): TexCountResultPayload {
  const fileMap = new Map(files.map((f) => [normalizeProjectPath(f.path), f.content]));
  const visited = new Set<string>();
  const flattenedLines: Array<{ filePath: string; line: number; text: string }> = [];

  const collectLines = (path: string): void => {
    const norm = normalizeProjectPath(path);
    if (visited.has(norm)) return;
    visited.add(norm);
    const content = fileMap.get(norm);
    if (!content) return;
    const lines = content.split(/\r?\n/u);
    for (let i = 0; i < lines.length; i += 1) {
      const text = lines[i] ?? "";
      const inputMatch = /^\s*\\(?:input|include)\s*\{([^}]+)\}/u.exec(text);
      if (inputMatch?.[1]) {
        const target = inputMatch[1].trim();
        collectLines(target.endsWith(".tex") ? target : `${target}.tex`);
        continue;
      }
      flattenedLines.push({ filePath: norm, line: i + 1, text });
    }
  };

  collectLines(rootFile);

  let currentSection: TexCountSectionBreakdown = {
    title: "Title & Preamble",
    wordsInText: 0,
    wordsInHeaders: 0,
    wordsInCaptions: 0,
    mathInlines: 0,
    mathDisplay: 0,
    filePath: rootFile,
    line: 1,
  };
  const sections: TexCountSectionBreakdown[] = [currentSection];

  let inDocument = !flattenedLines.some((l) => /\\begin\{document\}/u.test(l.text));
  let inDisplayMath = false;

  for (const entry of flattenedLines) {
    const raw = entry.text.replace(/(^|[^\\])%.*$/u, "$1").trim();
    if (!raw) continue;

    if (!inDocument) {
      const titleMatch = /\\title\*?\{([^{}]*)\}/u.exec(raw);
      if (titleMatch?.[1]) {
        currentSection = {
          ...currentSection,
          wordsInHeaders: currentSection.wordsInHeaders + countProseWords(titleMatch[1]),
        };
        sections[0] = currentSection;
      }
      if (/\\begin\{document\}/u.test(raw)) {
        inDocument = true;
      }
      continue;
    }

    if (/\\end\{document\}/u.test(raw)) {
      break;
    }

    const secMatch =
      /^\\(section|chapter|part)\*?\{([^{}]*)\}/u.exec(raw);
    if (secMatch?.[2]) {
      const headerWords = countProseWords(secMatch[2]);
      currentSection = {
        title: secMatch[2].trim(),
        wordsInText: 0,
        wordsInHeaders: headerWords,
        wordsInCaptions: 0,
        mathInlines: 0,
        mathDisplay: 0,
        filePath: entry.filePath,
        line: entry.line,
      };
      sections.push(currentSection);
      continue;
    }

    const subMatch = /^\\(subsection|subsubsection)\*?\{([^{}]*)\}/u.exec(raw);
    if (subMatch?.[2]) {
      currentSection.wordsInHeaders += countProseWords(subMatch[2]);
      continue;
    }

    if (/^\\begin\{(equation\*?|align\*?|gather\*?|multline\*?)\}/u.test(raw) || raw === "$$" || raw === "\\[") {
      inDisplayMath = true;
      currentSection.mathDisplay += 1;
      continue;
    }
    if (/^\\end\{(equation\*?|align\*?|gather\*?|multline\*?)\}/u.test(raw) || (inDisplayMath && (raw === "$$" || raw === "\\]"))) {
      inDisplayMath = false;
      continue;
    }
    if (inDisplayMath) {
      continue;
    }

    const captionMatch = /\\caption(?:\[[^\]]*\])?\{([^{}]*)\}/u.exec(raw);
    if (captionMatch?.[1]) {
      currentSection.wordsInCaptions += countProseWords(captionMatch[1]);
    }

    const inlineMatches = raw.match(/\$[^$\n]+\$/gu);
    if (inlineMatches) {
      currentSection.mathInlines += inlineMatches.length;
    }
    const withoutInlineMath = raw.replace(/\$[^$\n]+\$/gu, " ");
    currentSection.wordsInText += countProseWords(withoutInlineMath);
  }

  let wordsInText = 0;
  let wordsInHeaders = 0;
  let wordsInCaptions = 0;
  let mathInlines = 0;
  let mathDisplay = 0;
  for (const s of sections) {
    wordsInText += s.wordsInText;
    wordsInHeaders += s.wordsInHeaders;
    wordsInCaptions += s.wordsInCaptions;
    mathInlines += s.mathInlines;
    mathDisplay += s.mathDisplay;
  }

  return {
    source: "ast-fallback",
    wordsInText,
    wordsInHeaders,
    wordsInCaptions,
    totalWords: wordsInText + wordsInHeaders + wordsInCaptions,
    mathInlines,
    mathDisplay,
    characterCount: computeBodyCharacters(files),
    sections,
  };
}

export class TexCountService {
  private readonly processRunner: ProcessRunner;
  private readonly texcountExecutable: string;

  constructor(
    private readonly projectRoot: string,
    deps: { processRunner?: ProcessRunner; texcountExecutable?: string } = {},
  ) {
    this.processRunner = deps.processRunner ?? new NodeProcessRunner();
    this.texcountExecutable = deps.texcountExecutable ?? "texcount";
  }

  async count(request: TexCountRequest): Promise<TexCountResultPayload> {
    const normalizedRoot = normalizeProjectPath(request.rootFile || "main.tex");
    const files = request.files ?? [];

    try {
      const result = await this.processRunner.run({
        executable: this.texcountExecutable,
        args: ["-sub=section", "-merge", "-utf8", normalizedRoot],
        cwd: this.projectRoot,
        timeoutMs: TEXCOUNT_TIMEOUT_MS,
      });

      if (result.exitCode === 0 && result.stdout.trim() !== "") {
        const parsed = parseTexCountOutput(result.stdout, files, normalizedRoot);
        if (parsed !== null) {
          return parsed;
        }
      }
    } catch {
      // Fall through to deterministic AST counter below
    }

    return computeAstTexCount(normalizedRoot, files);
  }
}
