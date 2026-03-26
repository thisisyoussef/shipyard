import type { TurnMessage } from "./model-adapter.js";
import { truncateText } from "./turn-summary.js";

export const RAW_LOOP_MIN_MESSAGE_HISTORY_CHAR_BUDGET = 24_000;
export const RAW_LOOP_MAX_MESSAGE_HISTORY_CHAR_BUDGET = 32_000;
export const RAW_LOOP_COMPACTION_SUMMARY_CHAR_BUDGET = 2_600;
export const RAW_LOOP_PREFERRED_VERBATIM_TAIL_CYCLES = 1;
export const RAW_LOOP_MESSAGE_HISTORY_CHAR_BUDGET = RAW_LOOP_MIN_MESSAGE_HISTORY_CHAR_BUDGET;

export interface ToolHistoryDigest {
  requestLine: string;
  resultLine: string;
  isWriteLike: boolean;
  prefersVerbatimTail: boolean;
}

export interface CompletedToolExecution {
  toolName: string;
  input: unknown;
  success: boolean;
  output: string;
  error?: string;
  editedPath: string | null;
  touchedFiles: string[];
  historyDigest: ToolHistoryDigest;
}

export interface CompletedToolTurn {
  turnNumber: number;
  assistantMessage: TurnMessage;
  toolResultMessage: TurnMessage;
  toolExecutions: CompletedToolExecution[];
}

export interface CompactedMessageHistory {
  messages: TurnMessage[];
  didCompact: boolean;
  compactedTurnCount: number;
  preservedTailTurnCount: number;
  preservedTailMode: "none" | "verbatim" | "compact";
  historyCharBudget: number;
  estimatedCharsBefore: number;
  estimatedCharsAfter: number;
}

export function computeRawLoopMessageHistoryCharBudget(
  maxTokens: number,
): number {
  if (!Number.isFinite(maxTokens) || maxTokens <= 0) {
    return RAW_LOOP_MIN_MESSAGE_HISTORY_CHAR_BUDGET;
  }

  const scaledBudget = Math.round(maxTokens * 3);

  return Math.min(
    RAW_LOOP_MAX_MESSAGE_HISTORY_CHAR_BUDGET,
    Math.max(RAW_LOOP_MIN_MESSAGE_HISTORY_CHAR_BUDGET, scaledBudget),
  );
}

function estimateMessageChars(message: TurnMessage): number {
  try {
    return JSON.stringify(message).length;
  } catch {
    return String(message.content).length;
  }
}

function estimateHistoryChars(messages: TurnMessage[]): number {
  return messages.reduce(
    (total, message) => total + estimateMessageChars(message),
    0,
  );
}

function summarizeInputPath(input: unknown): string | null {
  if (
    typeof input === "object" &&
    input !== null &&
    "path" in input &&
    typeof input.path === "string" &&
    input.path.trim()
  ) {
    return input.path.trim();
  }

  return null;
}

function formatExecutionLabel(execution: CompletedToolExecution): string {
  const primaryPath =
    execution.touchedFiles[0]
    ?? execution.editedPath
    ?? summarizeInputPath(execution.input);

  return primaryPath
    ? `${execution.toolName}(${primaryPath})`
    : execution.toolName;
}

function extractLineCount(value: string): number | null {
  const match = value.match(
    /(?:created|updated)?\s*(\d+)\s+lines|lines\s*[:=]\s*(\d+)|total_lines\s*=\s*(\d+)/i,
  );
  const rawCount = match?.[1] ?? match?.[2] ?? match?.[3];

  return rawCount ? Number.parseInt(rawCount, 10) : null;
}

function formatCompactToolResult(
  execution: CompletedToolExecution,
): string {
  const baseLine = execution.historyDigest.resultLine;

  if (!execution.success) {
    return baseLine;
  }

  const lineCount = extractLineCount(execution.output)
    ?? extractLineCount(execution.historyDigest.resultLine)
    ?? extractLineCount(execution.historyDigest.requestLine);

  if (execution.toolName === "write_file" && lineCount !== null) {
    return `${formatExecutionLabel(execution)} created ${String(lineCount)} lines. ${baseLine}`;
  }

  if (execution.toolName === "edit_block" && lineCount !== null) {
    return `${formatExecutionLabel(execution)} updated ${String(lineCount)} lines. ${baseLine}`;
  }

  return baseLine;
}

function summarizeToolExecution(
  execution: CompletedToolExecution,
): string {
  return formatCompactToolResult(execution);
}

function summarizeCompactedTurn(turn: CompletedToolTurn): string {
  const toolSummaries = turn.toolExecutions.map(summarizeToolExecution);

  return `- Turn ${String(turn.turnNumber)}: ${toolSummaries.join("; ")}`;
}

function buildCompactionMessages(
  compactedTurns: CompletedToolTurn[],
): [TurnMessage, TurnMessage] {
  const retainedLines = compactedTurns.map(summarizeCompactedTurn);
  let omittedTurnCount = 0;

  while (retainedLines.length > 1) {
    const omissionLine = omittedTurnCount > 0
      ? `- ${String(omittedTurnCount)} earlier compacted turn(s) were omitted to stay within budget.`
      : null;
    const body = [
      "Earlier completed tool cycles were compacted to keep the prompt bounded.",
      "Use the current workspace as the source of truth and re-read files before editing when exact contents matter.",
      omissionLine,
      ...retainedLines,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n");

    if (body.length <= RAW_LOOP_COMPACTION_SUMMARY_CHAR_BUDGET) {
      return [
        {
          role: "assistant",
          content: body,
        },
        {
          role: "user",
          content:
            "Compacted history acknowledged. Re-read any referenced files from disk if exact content is needed.",
        },
      ];
    }

    retainedLines.shift();
    omittedTurnCount += 1;
  }

  const finalBody = truncateText(
    [
      "Earlier completed tool cycles were compacted to keep the prompt bounded.",
      "Use the current workspace as the source of truth and re-read files before editing when exact contents matter.",
      omittedTurnCount > 0
        ? `- ${String(omittedTurnCount)} earlier compacted turn(s) were omitted to stay within budget.`
        : null,
      ...retainedLines,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n"),
    RAW_LOOP_COMPACTION_SUMMARY_CHAR_BUDGET,
  );

  return [
    {
      role: "assistant",
      content: finalBody,
    },
    {
      role: "user",
      content:
        "Compacted history acknowledged. Re-read any referenced files from disk if exact content is needed.",
    },
  ];
}

function flattenCompletedTurns(completedTurns: CompletedToolTurn[]): TurnMessage[] {
  return completedTurns.flatMap((turn) => [turn.assistantMessage, turn.toolResultMessage]);
}

function buildCompactTurnMessages(
  turn: CompletedToolTurn,
): [TurnMessage, TurnMessage] {
  const requestedActions = turn.toolExecutions
    .map((execution) => `- ${execution.historyDigest.requestLine}`)
    .join("\n");
  const toolResults = turn.toolExecutions
    .map((execution) => `- ${formatCompactToolResult(execution)}`)
    .join("\n");

  return [
    {
      role: "assistant",
      content: [
        `Completed tool requests from turn ${String(turn.turnNumber)} were compacted to keep replay history bounded.`,
        "Requested Actions:",
        requestedActions || "- (none)",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        "Compact tool results for the same completed turn:",
        toolResults || "- (none)",
        "Re-read the file from disk if exact contents are needed before another edit.",
      ].join("\n"),
    },
  ];
}

function flattenCompletedTurnsWithMode(
  completedTurns: CompletedToolTurn[],
  mode: "verbatim" | "compact",
): TurnMessage[] {
  if (mode === "verbatim") {
    return flattenCompletedTurns(completedTurns);
  }

  return completedTurns.flatMap((turn) => buildCompactTurnMessages(turn));
}

function shouldPreferVerbatimTailTurn(
  turn: CompletedToolTurn | undefined,
): boolean {
  if (!turn) {
    return false;
  }

  return turn.toolExecutions.some((execution) =>
    execution.historyDigest.prefersVerbatimTail
  ) && !turn.toolExecutions.some((execution) => execution.historyDigest.isWriteLike);
}

function isWriteHeavyTurn(
  turn: CompletedToolTurn | undefined,
): boolean {
  if (!turn) {
    return false;
  }

  return turn.toolExecutions.some((execution) => execution.historyDigest.isWriteLike);
}

export function buildCompactedMessageHistory(options: {
  initialUserMessage: TurnMessage;
  completedTurns: CompletedToolTurn[];
  finalAssistantMessage?: TurnMessage | null;
  historyCharBudget?: number;
  maxTokens?: number;
}): CompactedMessageHistory {
  const historyCharBudget = options.historyCharBudget
    ?? computeRawLoopMessageHistoryCharBudget(options.maxTokens ?? RAW_LOOP_MAX_MESSAGE_HISTORY_CHAR_BUDGET);
  const finalAssistantMessages = options.finalAssistantMessage
    ? [options.finalAssistantMessage]
    : [];
  const rawMessages = [
    options.initialUserMessage,
    ...flattenCompletedTurns(options.completedTurns),
    ...finalAssistantMessages,
  ];
  const estimatedCharsBefore = estimateHistoryChars(rawMessages);
  const latestTurn = options.completedTurns.at(-1);

  if (!latestTurn) {
    return {
      messages: rawMessages,
      didCompact: false,
      compactedTurnCount: 0,
      preservedTailTurnCount: 0,
      preservedTailMode: "none",
      historyCharBudget,
      estimatedCharsBefore,
      estimatedCharsAfter: estimatedCharsBefore,
    };
  }

  const olderTurns = options.completedTurns.slice(
    0,
    Math.max(options.completedTurns.length - RAW_LOOP_PREFERRED_VERBATIM_TAIL_CYCLES, 0),
  );
  const verbatimTailTurns = options.completedTurns.slice(
    Math.max(options.completedTurns.length - RAW_LOOP_PREFERRED_VERBATIM_TAIL_CYCLES, 0),
  );
  const prefersVerbatimTail = shouldPreferVerbatimTailTurn(latestTurn);
  const allowCompactTail = isWriteHeavyTurn(latestTurn) || !prefersVerbatimTail;
  const tailModes: Array<"verbatim" | "compact"> = allowCompactTail
    ? ["verbatim", "compact"]
    : ["verbatim"];

  for (const preservedTailMode of tailModes) {
    for (let summarizedOldTurnCount = 0; summarizedOldTurnCount <= olderTurns.length; summarizedOldTurnCount += 1) {
      const summarizedOldTurns = olderTurns.slice(0, summarizedOldTurnCount);
      const compactOldTurns = olderTurns.slice(summarizedOldTurnCount);
      const compactedTailTurns = preservedTailMode === "compact"
        ? verbatimTailTurns
        : [];
      const exactTailTurns = preservedTailMode === "verbatim"
        ? verbatimTailTurns
        : [];
      const messages = [
        options.initialUserMessage,
        ...(summarizedOldTurns.length > 0
          ? buildCompactionMessages(summarizedOldTurns)
          : []),
        ...flattenCompletedTurnsWithMode(compactOldTurns, "compact"),
        ...flattenCompletedTurnsWithMode(compactedTailTurns, "compact"),
        ...flattenCompletedTurnsWithMode(exactTailTurns, "verbatim"),
        ...finalAssistantMessages,
      ];
      const estimatedCharsAfter = estimateHistoryChars(messages);
      const compactedTurnCount =
        summarizedOldTurns.length
        + compactOldTurns.length
        + compactedTailTurns.length;

      if (estimatedCharsAfter <= historyCharBudget) {
        return {
          messages,
          didCompact: compactedTurnCount > 0,
          compactedTurnCount,
          preservedTailTurnCount: verbatimTailTurns.length,
          preservedTailMode,
          historyCharBudget,
          estimatedCharsBefore,
          estimatedCharsAfter,
        };
      }

      if (
        summarizedOldTurnCount === olderTurns.length
        && preservedTailMode === tailModes.at(-1)
      ) {
        return {
          messages,
          didCompact: compactedTurnCount > 0,
          compactedTurnCount,
          preservedTailTurnCount: verbatimTailTurns.length,
          preservedTailMode,
          historyCharBudget,
          estimatedCharsBefore,
          estimatedCharsAfter,
        };
      }
    }
  }

  return {
    messages: rawMessages,
    didCompact: false,
    compactedTurnCount: 0,
    preservedTailTurnCount: options.completedTurns.length,
    preservedTailMode: "verbatim",
    historyCharBudget,
    estimatedCharsBefore,
    estimatedCharsAfter: estimatedCharsBefore,
  };
}
