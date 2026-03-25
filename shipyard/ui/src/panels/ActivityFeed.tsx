/**
 * ActivityFeed — Timeline of agent turns and tool calls.
 * UIV3-S05 · Activity Feed
 *
 * Shows turn history with instruction, status, summary,
 * and expandable tool call details.
 */

import type { ReactNode } from "react";

import type { BadgeTone } from "../primitives.js";
import { Badge, StatusDot } from "../primitives.js";
import type { TurnViewModel } from "../view-models.js";

/* ── Props ──────────────────────────────────────── */

export interface ActivityFeedProps {
  /** List of turns to display */
  turns: TurnViewModel[];
  /** Custom empty state content */
  emptyContent?: ReactNode;
}

/* ── Helpers ────────────────────────────────────── */

function getTurnTone(status: TurnViewModel["status"]): BadgeTone {
  switch (status) {
    case "success":
      return "success";
    case "error":
      return "danger";
    case "working":
      return "accent";
    default:
      return "neutral";
  }
}

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/* ── Component ──────────────────────────────────── */

export function ActivityFeed({ turns, emptyContent }: ActivityFeedProps) {
  if (turns.length === 0) {
    return (
      <div className="activity-panel">
        <div className="activity-panel-header">
          <h2 className="activity-panel-title">Activity</h2>
        </div>
        <div className="activity-empty">
          {emptyContent ?? (
            <>
              <svg
                className="activity-empty-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M12 8v4l3 3" />
                <circle cx="12" cy="12" r="9" />
              </svg>
              <p className="activity-empty-text">
                No activity yet. Submit an instruction to begin.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="activity-panel">
      <div className="activity-panel-header">
        <h2 className="activity-panel-title">Activity</h2>
        <Badge tone="neutral">{turns.length} turns</Badge>
      </div>

      <div className="activity-timeline" role="feed" aria-label="Activity feed">
        {turns.map((turn) => {
          const tone = getTurnTone(turn.status);
          const isWorking = turn.status === "working";
          const activityCount = turn.activity?.length ?? 0;

          return (
            <article
              key={turn.id}
              className="activity-turn"
              data-status={turn.status}
              aria-labelledby={`turn-${turn.id}-instruction`}
            >
              <div className="activity-turn-header">
                <h3
                  id={`turn-${turn.id}-instruction`}
                  className="activity-turn-instruction"
                >
                  {turn.instruction}
                </h3>
                <Badge tone={tone}>
                  <StatusDot tone={tone} pulse={isWorking} />
                  {turn.status}
                </Badge>
              </div>

              {turn.summary && (
                <p className="activity-turn-summary">{turn.summary}</p>
              )}

              <div className="activity-turn-meta">
                {turn.startedAt && (
                  <time dateTime={turn.startedAt}>
                    {formatTime(turn.startedAt)}
                  </time>
                )}
                {activityCount > 0 && (
                  <span>{activityCount} activities</span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
