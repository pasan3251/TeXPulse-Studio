import type {
  BibEntrySymbol,
  LabelSymbol,
  ProjectFile,
  ProjectSymbolIndex,
} from "@texpulse/shared";

const LABEL_PATTERN = /\\label\{([^}\s]+)\}/gu;
const SECTION_PATTERN =
  /\\(?:part|chapter|section|subsection|subsubsection)\*?\{([^}]*)\}/u;
const BIB_ENTRY_START = /@([a-zA-Z]+)\s*\{\s*([^,\s]+)\s*,/gu;

function extractBibField(block: string, fieldName: string): string {
  const regex = new RegExp(
    `(?:^|,)\\s*${fieldName}\\s*=\\s*(?:\\{([\\s\\S]*?)\\}|"([\\s\\S]*?)"|(\\d+))`,
    "iu",
  );
  const match = regex.exec(block);
  if (match === null) return "";
  const raw = match[1] ?? match[2] ?? match[3] ?? "";
  return raw.replace(/\s+/gu, " ").trim();
}

function lineNumberAt(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) {
      line += 1;
    }
  }
  return line;
}

/**
 * Indexes a single `.tex` file for `\label{key}` declarations alongside the
 * nearest enclosing section or environment title.
 */
export function indexTexLabels(file: Pick<ProjectFile, "path" | "content">): LabelSymbol[] {
  const labels: LabelSymbol[] = [];
  const seen = new Set<string>();
  const lines = file.content.split(/\r?\n/u);
  let lastHeading = file.path;

  for (let index = 0; index < lines.length; index += 1) {
    const lineText = lines[index] ?? "";
    const commentFree = lineText.replace(/(^|[^\\])%.*$/u, "$1");
    const headingMatch = SECTION_PATTERN.exec(commentFree);
    if (headingMatch?.[1]) {
      lastHeading = headingMatch[1].trim();
    }

    LABEL_PATTERN.lastIndex = 0;
    for (const match of commentFree.matchAll(LABEL_PATTERN)) {
      const key = match[1]?.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      labels.push({
        key,
        filePath: file.path,
        line: index + 1,
        contextTitle: lastHeading,
      });
    }
  }

  return labels;
}

/**
 * Indexes a single `.bib` file for `@type{key, ...}` bibliographic entries.
 */
export function indexBibEntries(file: Pick<ProjectFile, "path" | "content">): BibEntrySymbol[] {
  const entries: BibEntrySymbol[] = [];
  const text = file.content;
  const matches = [...text.matchAll(BIB_ENTRY_START)];

  for (let i = 0; i < matches.length; i += 1) {
    const current = matches[i];
    if (!current) continue;
    const entryType = (current[1] ?? "misc").toLowerCase();
    const key = (current[2] ?? "").trim();
    if (!key) continue;

    const startOffset = current.index ?? 0;
    const nextOffset = matches[i + 1]?.index ?? text.length;
    const block = text.slice(startOffset, nextOffset);

    const title = extractBibField(block, "title") || "(Untitled entry)";
    const author = extractBibField(block, "author") || extractBibField(block, "editor") || "Unknown author";
    const year = extractBibField(block, "year") || "n.d.";

    entries.push({
      key,
      entryType,
      title,
      author,
      year,
      filePath: file.path,
      line: lineNumberAt(text, startOffset),
    });
  }

  return entries;
}

/**
 * Scans all open workspace files to build the cross-file `\label` and `\cite`
 * completion index.
 */
export function buildProjectSymbolIndex(files: readonly ProjectFile[]): ProjectSymbolIndex {
  const labels: LabelSymbol[] = [];
  const citations: BibEntrySymbol[] = [];
  const seenLabels = new Set<string>();
  const seenCites = new Set<string>();

  for (const file of files) {
    if (file.kind === "tex") {
      for (const label of indexTexLabels(file)) {
        if (!seenLabels.has(label.key)) {
          seenLabels.add(label.key);
          labels.push(label);
        }
      }
    } else if (file.kind === "bib") {
      for (const entry of indexBibEntries(file)) {
        if (!seenCites.has(entry.key)) {
          seenCites.add(entry.key);
          citations.push(entry);
        }
      }
    }
  }

  return { labels, citations };
}
