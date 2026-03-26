export const ROLLING_SUMMARY_MAX_LINES = 8;
export const ROLLING_SUMMARY_MAX_CHARS = 1_800;
export const ROLLING_SUMMARY_INSTRUCTION_CHAR_LIMIT = 160;
export const ROLLING_SUMMARY_ENTRY_CHAR_LIMIT = 120;

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
