export const ROLLING_SUMMARY_MAX_LINES = 8;
export const ROLLING_SUMMARY_MAX_CHARS = 1_800;
export const ROLLING_SUMMARY_INSTRUCTION_CHAR_LIMIT = 160;
export const ROLLING_SUMMARY_ENTRY_CHAR_LIMIT = 120;
export const TOOL_RESULT_DETAIL_MAX_LINES = 40;
export const TOOL_RESULT_DETAIL_MAX_CHARS = 1_200;

export function truncateText(value: string, limit = 240): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  if (trimmed.length <= limit) {
    return trimmed;
  }

  return `${trimmed.slice(0, limit - 1)}…`;
}

export function createToolResultDetailExcerpt(
  value: string,
  options: {
    maxLines?: number;
    maxChars?: number;
  } = {},
): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  const maxLines = Math.max(
    1,
    Math.floor(options.maxLines ?? TOOL_RESULT_DETAIL_MAX_LINES),
  );
  const maxChars = Math.max(
    1,
    Math.floor(options.maxChars ?? TOOL_RESULT_DETAIL_MAX_CHARS),
  );
  const lines = trimmed.split("\n");
  const lineLimited = lines.slice(0, maxLines).join("\n").trimEnd();
  const charLimited = lineLimited.length > maxChars
    ? lineLimited.slice(0, maxChars).trimEnd()
    : lineLimited;
  const omittedLines = Math.max(lines.length - maxLines, 0);
  const omittedChars = Math.max(trimmed.length - charLimited.length, 0);

  if (omittedLines === 0 && omittedChars === 0) {
    return charLimited;
  }

  const suffixParts: string[] = [];

  if (omittedLines > 0) {
    suffixParts.push(
      `${String(omittedLines)} more line${omittedLines === 1 ? "" : "s"}`,
    );
  }

  if (omittedChars > 0) {
    suffixParts.push(
      `${String(omittedChars)} more char${omittedChars === 1 ? "" : "s"}`,
    );
  }

  return `${charLimited}\n...[truncated ${suffixParts.join(", ")}]`;
}

function clampRollingSummary(summary: string): string {
  const lines = summary
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .slice(-ROLLING_SUMMARY_MAX_LINES);

  while (lines.length > 1 && lines.join("\n").length > ROLLING_SUMMARY_MAX_CHARS) {
    lines.shift();
  }

  const [onlyLine] = lines;

  if (lines.length === 1 && onlyLine && onlyLine.length > ROLLING_SUMMARY_MAX_CHARS) {
    lines[0] = truncateText(onlyLine, ROLLING_SUMMARY_MAX_CHARS);
  }

  return lines.join("\n");
}

export function updateRollingSummary(
  currentSummary: string,
  turnCount: number,
  instruction: string,
  summary: string,
): string {
  const nextLine =
    `Turn ${turnCount}: ${truncateText(instruction, ROLLING_SUMMARY_INSTRUCTION_CHAR_LIMIT)} -> ` +
    `${truncateText(summary, ROLLING_SUMMARY_ENTRY_CHAR_LIMIT)}`;
  const nextSummary = currentSummary
    ? `${currentSummary}\n${nextLine}`
    : nextLine;

  return clampRollingSummary(nextSummary);
}

export function createExecutionTurnSummary(
  turnCount: number,
  runtimeMode: "graph" | "fallback",
  finalStateStatus: "done" | "failed" | "cancelled",
  finalText: string,
): string {
  const statusLabel = finalStateStatus === "failed"
    ? "failed"
    : finalStateStatus === "cancelled"
      ? "cancelled"
      : "completed";

  return `Turn ${turnCount} ${statusLabel} via ${runtimeMode}: ${truncateText(finalText, 140)}`;
}

export function createPlanningTurnSummary(
  turnCount: number,
  runtimeMode: "graph" | "fallback",
  finalText: string,
): string {
  return `Turn ${turnCount} planned via ${runtimeMode}: ${truncateText(finalText, 140)}`;
}

export function createCancelledTurnText(
  turnCount: number,
  reason: string,
): string {
  return `Turn ${String(turnCount)} cancelled: ${reason}`;
}
