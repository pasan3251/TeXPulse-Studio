import {
  discoverExecutable,
  type ExecutableDiscoveryOptions,
} from "./executable-discovery.js";
import { TOOL_SPECS, type ToolId, type ToolSpec } from "./tool-specs.js";
import { normalizeToolOutput, parseToolVersion } from "./version-parser.js";
import {
  NodeProcessRunner,
  type ProcessRunner,
} from "../process/process-runner.js";
import { environmentWithPrependedPath } from "../process/environment.js";

export type ToolState = "available" | "missing" | "unusable";

export interface ToolProbe {
  id: ToolId;
  label: string;
  state: ToolState;
  path: string | null;
  version: string | null;
  exitCode: number | null;
  detail: string | null;
}

export interface ToolchainIssue {
  severity: "error" | "warning";
  tool: ToolId;
  message: string;
}

export interface ToolchainProbe {
  tools: ToolProbe[];
  requiredToolsAvailable: boolean;
  issues: ToolchainIssue[];
}

export interface ToolchainProbeOptions extends ExecutableDiscoveryOptions {
  processRunner?: ProcessRunner;
  specs?: readonly ToolSpec[];
}

const REQUIRED_TOOLS: ReadonlySet<ToolId> = new Set(["latexmk", "pdflatex"]);

function missingMessage(spec: ToolSpec): string {
  return `${spec.label} was not found. Install MiKTeX or add its executable directory to PATH or --custom-bin.`;
}

function unusableMessage(spec: ToolSpec, output: string): string {
  if (
    spec.id === "latexmk" &&
    /script engine ['"]?perl|perl.*(?:missing|not found)/i.test(output)
  ) {
    return "latexmk was found but cannot run because Perl is missing. Install native Windows Perl and ensure perl.exe is on PATH.";
  }

  return `${spec.label} was found but its version probe failed. Run the executable directly for details.`;
}

function versionUnavailableMessage(spec: ToolSpec): string {
  return `${spec.label} is runnable but did not report a parseable version.`;
}

async function probeTool(
  spec: ToolSpec,
  options: ToolchainProbeOptions,
  processRunner: ProcessRunner,
): Promise<ToolProbe> {
  const path = await discoverExecutable(spec.executableName, options);

  if (path === null) {
    return {
      id: spec.id,
      label: spec.label,
      state: "missing",
      path: null,
      version: null,
      exitCode: null,
      detail: missingMessage(spec),
    };
  }

  const result = await processRunner.run({
    executable: path,
    args: spec.versionArgs,
    ...(options.customBinDirectory === undefined
      ? {}
      : {
          env: environmentWithPrependedPath(options.customBinDirectory),
        }),
  });
  const output = normalizeToolOutput(result.stdout, result.stderr);
  const version = parseToolVersion(spec.id, result.stdout, result.stderr);
  const makeIndexUsage =
    spec.id === "makeindex" && /Usage:\s*makeindex/i.test(output);
  const usable =
    result.error === null &&
    (result.exitCode === 0 || version !== null || makeIndexUsage);
  const updateAdvisory = /major issue:.*updates/i.test(output)
    ? "MiKTeX reports that updates have not been checked. Open MiKTeX Console and check for updates before relying on the toolchain."
    : null;

  return {
    id: spec.id,
    label: spec.label,
    state: usable ? "available" : "unusable",
    path,
    version,
    exitCode: result.exitCode,
    detail: usable
      ? (updateAdvisory ??
        (version === null ? versionUnavailableMessage(spec) : null))
      : (result.error ?? unusableMessage(spec, output)),
  };
}

export async function probeToolchain(
  options: ToolchainProbeOptions = {},
): Promise<ToolchainProbe> {
  const processRunner = options.processRunner ?? new NodeProcessRunner();
  const specs = options.specs ?? TOOL_SPECS;
  const tools = await Promise.all(
    specs.map((spec) => probeTool(spec, options, processRunner)),
  );
  const issueCandidates: ToolchainIssue[] = tools.flatMap((tool) => {
    if (tool.detail === null) {
      return [];
    }

    return [
      {
        severity:
          REQUIRED_TOOLS.has(tool.id) && tool.state !== "available"
            ? "error"
            : "warning",
        tool: tool.id,
        message: tool.detail,
      },
    ];
  });
  const seenMessages = new Set<string>();
  const issues = issueCandidates.filter((issue) => {
    if (seenMessages.has(issue.message)) {
      return false;
    }
    seenMessages.add(issue.message);
    return true;
  });

  return {
    tools,
    requiredToolsAvailable: [...REQUIRED_TOOLS].every((requiredTool) =>
      tools.some(
        (tool) => tool.id === requiredTool && tool.state === "available",
      ),
    ),
    issues,
  };
}
