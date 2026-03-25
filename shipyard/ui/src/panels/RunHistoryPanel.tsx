import { Badge, StatusDot } from "../primitives.js";
import type { BadgeTone } from "../primitives.js";
import type { SessionRunSummaryViewModel } from "../view-models.js";

export interface RunHistoryPanelProps {
  runs: SessionRunSummaryViewModel[];
  currentSessionId: string | null;
  onResumeSession: (sessionId: string) => void;
}

function formatRunTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

function getRunTone(
  status: SessionRunSummaryViewModel["latestStatus"],
): BadgeTone {
  switch (status) {
    case "success":
      return "success";
    case "cancelled":
      return "neutral";
    case "error":
      return "danger";
    case "working":
      return "accent";
    default:
      return "neutral";
  }
}

function getRunHeadline(run: SessionRunSummaryViewModel): string {
  if (run.latestInstruction) {
    return run.latestInstruction;
  }

  if (run.activePhase === "target-manager") {
    return "Target selection run";
  }

  return "Saved Shipyard run";
}

function getRunSummary(run: SessionRunSummaryViewModel): string {
  if (run.latestSummary) {
    return run.latestSummary;
  }

  if (run.turnCount === 0) {
    return "No turns have been recorded for this run yet.";
  }

  return `${String(run.turnCount)} turns recorded for this run.`;
}

export function RunHistoryPanel({
  runs,
  currentSessionId,
  onResumeSession,
}: RunHistoryPanelProps) {
  return (
    <div className="run-history-panel">
      <div className="panel-header">
        <div>
          <p className="panel-kicker">Saved Runs</p>
          <h2 className="panel-title">Previous runs</h2>
        </div>
        <Badge tone="neutral">{runs.length}</Badge>
      </div>

      {runs.length === 0 ? (
        <div className="context-empty">
          <p className="context-empty-text">
            Saved runs will appear here once Shipyard has session history for this target.
          </p>
        </div>
      ) : (
        <div className="run-history-list">
          {runs.map((run) => {
            const isCurrent = run.isCurrent || run.sessionId === currentSessionId;
            const tone = getRunTone(run.latestStatus);

            return (
              <article
                key={run.sessionId}
                className="run-history-item"
                data-current={isCurrent}
              >
                <div className="run-history-item-header">
                  <div className="run-history-item-copy">
                    <p className="run-history-item-phase">
                      {isCurrent ? "Current run" : "Saved run"}
                    </p>
                    <h3 className="run-history-item-title">{getRunHeadline(run)}</h3>
                  </div>
                  <Badge tone={tone}>
                    <StatusDot tone={tone} pulse={run.latestStatus === "working"} />
                    {run.latestStatus ?? "idle"}
                  </Badge>
                </div>

                <p className="run-history-item-summary">{getRunSummary(run)}</p>

                <div className="run-history-item-meta">
                  <span>{String(run.turnCount)} turns</span>
                  <time dateTime={run.lastActiveAt}>
                    {formatRunTime(run.lastActiveAt)}
                  </time>
                </div>

                <div className="run-history-item-actions">
                  <code
                    className="run-history-item-id"
                    title={run.sessionId}
                  >
                    {run.sessionId.slice(0, 12)}
                  </code>
                  <button
                    type="button"
                    className="run-history-item-button"
                    onClick={() => onResumeSession(run.sessionId)}
                    disabled={isCurrent}
                    aria-label={
                      isCurrent
                        ? `Current run ${run.sessionId}`
                        : `Resume saved run ${run.sessionId}`
                    }
                  >
                    {isCurrent ? "Current run" : "Resume"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
