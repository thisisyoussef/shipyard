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

export function updateRollingSummary(
  currentSummary: string,
  turnCount: number,
  instruction: string,
  summary: string,
): string {
  const nextLine = `Turn ${turnCount}: ${instruction} -> ${truncateText(summary, 120)}`;
  const nextSummary = currentSummary
    ? `${currentSummary}\n${nextLine}`
    : nextLine;

  return nextSummary
    .split("\n")
    .slice(-8)
    .join("\n");
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
