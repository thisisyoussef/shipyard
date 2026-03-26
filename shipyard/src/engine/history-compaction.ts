import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

import { truncateText } from "./turn-summary.js";

export const RAW_LOOP_MESSAGE_HISTORY_CHAR_BUDGET = 24_000;
export const RAW_LOOP_COMPACTION_SUMMARY_CHAR_BUDGET = 4_200;
export const RAW_LOOP_PREFERRED_VERBATIM_TAIL_CYCLES = 1;

export interface CompletedToolTurn {
  turnNumber: number;
  assistantMessage: MessageParam;
  toolResultMessage: MessageParam;
  toolExecutions: Array<{
    toolName: string;
    input: unknown;
    success: boolean;
    output: string;
    error?: string;
    editedPath: string | null;
    data?: unknown;
  }>;
}

export interface CompactedMessageHistory {
  messages: MessageParam[];
  didCompact: boolean;
  compactedTurnCount: number;
  preservedTailTurnCount: number;
  estimatedCharsBefore: number;
  estimatedCharsAfter: number;
}

function estimateMessageChars(message: MessageParam): number {
  try {
    return JSON.stringify(message).length;
  } catch {
    return String(message.content).length;
  }
}

function estimateHistoryChars(messages: MessageParam[]): number {
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

function formatPreviewBlock(preview: string): string {
  return truncateText(preview.trim(), 220);
}

function isWritePreviewData(
  data: unknown,
): data is {
  path: string;
  totalLines: number;
  afterPreview: string;
} {
  return (
    typeof data === "object" &&
    data !== null &&
    "path" in data &&
    typeof data.path === "string" &&
    "totalLines" in data &&
    typeof data.totalLines === "number" &&
    "afterPreview" in data &&
    typeof data.afterPreview === "string"
  );
}

function isEditPreviewData(
  data: unknown,
): data is {
  path: string;
  addedLines: number;
  removedLines: number;
  totalLines: number;
  afterPreview: string;
} {
  return (
    typeof data === "object" &&
    data !== null &&
    "path" in data &&
    typeof data.path === "string" &&
    "addedLines" in data &&
    typeof data.addedLines === "number" &&
    "removedLines" in data &&
    typeof data.removedLines === "number" &&
    "totalLines" in data &&
    typeof data.totalLines === "number" &&
    "afterPreview" in data &&
    typeof data.afterPreview === "string"
  );
}

function isBootstrapPreviewData(
  data: unknown,
): data is {
  createdFiles: string[];
  scaffoldType: string;
} {
  return (
    typeof data === "object" &&
    data !== null &&
    "createdFiles" in data &&
    Array.isArray(data.createdFiles) &&
    data.createdFiles.every((item) => typeof item === "string") &&
    "scaffoldType" in data &&
    typeof data.scaffoldType === "string"
  );
}

function summarizeToolExecution(
  execution: CompletedToolTurn["toolExecutions"][number],
): string {
  const pathLabel = execution.editedPath
    ?? summarizeInputPath(execution.input);
  const toolLabel = pathLabel
    ? `${execution.toolName}(${pathLabel})`
    : execution.toolName;

  if (!execution.success) {
    const detail = truncateText(execution.error ?? execution.output, 90);
    return `${toolLabel} failed: ${detail || "Tool failed."}`;
  }

  if (
    execution.toolName === "write_file"
    || execution.toolName === "edit_block"
    || execution.toolName === "bootstrap_target"
  ) {
    if (execution.toolName === "write_file" && isWritePreviewData(execution.data)) {
      return (
        `${toolLabel} created ${String(execution.data.totalLines)} lines. ` +
        `Preview: ${formatPreviewBlock(execution.data.afterPreview)}`
      );
    }

    if (execution.toolName === "edit_block" && isEditPreviewData(execution.data)) {
      return (
        `${toolLabel} updated +${String(execution.data.addedLines)}` +
        `/-${String(execution.data.removedLines)} lines ` +
        `(total ${String(execution.data.totalLines)}). ` +
        `After preview: ${formatPreviewBlock(execution.data.afterPreview)}`
      );
    }

    if (
      execution.toolName === "bootstrap_target" &&
      isBootstrapPreviewData(execution.data)
    ) {
      const createdPreview = execution.data.createdFiles.slice(0, 6).join(", ");
      const omittedCount =
        execution.data.createdFiles.length
        - Math.min(execution.data.createdFiles.length, 6);
      const omittedLabel = omittedCount > 0
        ? ` (+${String(omittedCount)} more)`
        : "";

      return (
        `${toolLabel} bootstrapped ${execution.data.scaffoldType} with ` +
        `${String(execution.data.createdFiles.length)} files: ` +
        `${createdPreview}${omittedLabel}`
      );
    }

    return `${toolLabel} succeeded; re-read the workspace if exact generated contents matter.`;
  }

  const detail = truncateText(execution.output, 90);
  return detail
    ? `${toolLabel} succeeded: ${detail}`
    : `${toolLabel} succeeded.`;
}

function summarizeCompactedTurn(turn: CompletedToolTurn): string {
  const toolSummaries = turn.toolExecutions.map(summarizeToolExecution);

  return `- Turn ${String(turn.turnNumber)}: ${toolSummaries.join("; ")}`;
}

function buildCompactionMessages(
  compactedTurns: CompletedToolTurn[],
): [MessageParam, MessageParam] {
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

function flattenCompletedTurns(completedTurns: CompletedToolTurn[]): MessageParam[] {
  return completedTurns.flatMap((turn) => [turn.assistantMessage, turn.toolResultMessage]);
}

function shouldForcePreserveVerbatimTailTurn(
  turn: CompletedToolTurn | undefined,
): boolean {
  if (!turn) {
    return false;
  }

  const hasSuccessfulRead = turn.toolExecutions.some((execution) =>
    execution.success && execution.toolName === "read_file"
  );
  const includesContextPoisoningWrite = turn.toolExecutions.some((execution) =>
    execution.toolName === "write_file"
    || execution.toolName === "edit_block"
    || execution.toolName === "bootstrap_target"
  );

  return hasSuccessfulRead && !includesContextPoisoningWrite;
}

export function buildCompactedMessageHistory(options: {
  initialUserMessage: MessageParam;
  completedTurns: CompletedToolTurn[];
  finalAssistantMessage?: MessageParam | null;
}): CompactedMessageHistory {
  const finalAssistantMessages = options.finalAssistantMessage
    ? [options.finalAssistantMessage]
    : [];
  const rawMessages = [
    options.initialUserMessage,
    ...flattenCompletedTurns(options.completedTurns),
    ...finalAssistantMessages,
  ];
  const estimatedCharsBefore = estimateHistoryChars(rawMessages);

  if (estimatedCharsBefore <= RAW_LOOP_MESSAGE_HISTORY_CHAR_BUDGET) {
    return {
      messages: rawMessages,
      didCompact: false,
      compactedTurnCount: 0,
      preservedTailTurnCount: options.completedTurns.length,
      estimatedCharsBefore,
      estimatedCharsAfter: estimatedCharsBefore,
    };
  }

  const forcedVerbatimTailTurns = shouldForcePreserveVerbatimTailTurn(
    options.completedTurns.at(-1),
  )
    ? 1
    : 0;
  const maxTailCycles = Math.min(
    RAW_LOOP_PREFERRED_VERBATIM_TAIL_CYCLES,
    options.completedTurns.length,
  );
  const minTailCycles = Math.min(
    forcedVerbatimTailTurns,
    options.completedTurns.length,
  );

  for (
    let preservedTailTurnCount = maxTailCycles;
    preservedTailTurnCount >= minTailCycles;
    preservedTailTurnCount -= 1
  ) {
    const compactedTurnCount =
      options.completedTurns.length - preservedTailTurnCount;

    if (compactedTurnCount <= 0) {
      continue;
    }

    const compactedTurns = options.completedTurns.slice(0, compactedTurnCount);
    const preservedTailTurns = options.completedTurns.slice(compactedTurnCount);
    const compactionMessages = buildCompactionMessages(compactedTurns);
    const messages = [
      options.initialUserMessage,
      ...compactionMessages,
      ...flattenCompletedTurns(preservedTailTurns),
      ...finalAssistantMessages,
    ];
    const estimatedCharsAfter = estimateHistoryChars(messages);

    if (estimatedCharsAfter <= RAW_LOOP_MESSAGE_HISTORY_CHAR_BUDGET) {
      return {
        messages,
        didCompact: true,
        compactedTurnCount,
        preservedTailTurnCount,
        estimatedCharsBefore,
        estimatedCharsAfter,
      };
    }

    if (preservedTailTurnCount === minTailCycles) {
      return {
        messages,
        didCompact: true,
        compactedTurnCount,
        preservedTailTurnCount,
        estimatedCharsBefore,
        estimatedCharsAfter,
      };
    }
  }

  return {
    messages: rawMessages,
    didCompact: false,
    compactedTurnCount: 0,
    preservedTailTurnCount: options.completedTurns.length,
    estimatedCharsBefore,
    estimatedCharsAfter: estimatedCharsBefore,
  };
}
