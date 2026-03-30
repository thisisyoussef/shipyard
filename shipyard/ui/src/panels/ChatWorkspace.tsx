import type { ReactNode } from "react";

import { Badge, StatusDot } from "../primitives.js";
import type { BadgeTone } from "../primitives.js";
import type { TurnViewModel } from "../view-models.js";
import { FormattedMessage } from "./FormattedMessage.js";

export interface ChatWorkspaceProps {
  turns: TurnViewModel[];
  emptyContent?: ReactNode;
}

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
    return new Date(isoString).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatStepCount(count: number): string {
  return `${String(count)} step${count === 1 ? "" : "s"} recorded`;
}

function formatTurnCount(count: number): string {
  return `${String(count)} turn${count === 1 ? "" : "s"}`;
}

export function ChatWorkspace({
  turns,
  emptyContent,
}: ChatWorkspaceProps) {
  const orderedTurns = [...turns].reverse();

  if (orderedTurns.length === 0) {
    return (
      <section className="chat-workspace">
        <div className="chat-workspace-header">
          <div>
            <p className="panel-kicker">Chat</p>
            <h2 className="panel-title">Latest conversation</h2>
          </div>
        </div>
        <div className="activity-empty">
          {emptyContent ?? (
            <p className="activity-empty-text">
              Submit an instruction to start a conversation with Shipyard.
            </p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="chat-workspace" aria-labelledby="chat-workspace-title">
      <div className="chat-workspace-header">
        <div>
          <p className="panel-kicker">Chat</p>
          <h2 id="chat-workspace-title" className="panel-title">
            Latest conversation
          </h2>
        </div>
        <Badge tone="neutral">{formatTurnCount(orderedTurns.length)}</Badge>
      </div>

      <div className="chat-thread" role="log" aria-label="Conversation history">
        {orderedTurns.map((turn) => {
          const tone = getTurnTone(turn.status);
          const latestReply =
            turn.agentMessages.at(-1) ?? turn.summary ?? "Waiting for Shipyard.";

          return (
            <article key={turn.id} className="chat-turn">
              <div className="chat-message chat-message-user">
                <div className="chat-message-meta">
                  <span className="chat-message-role">You</span>
                  <time dateTime={turn.startedAt}>{formatTime(turn.startedAt)}</time>
                </div>
                <div className="chat-bubble chat-bubble-user">
                  <div className="chat-bubble-body">
                    <p>{turn.instruction}</p>
                  </div>
                  {turn.contextPreview.length > 0 ? (
                    <div className="chat-context-list">
                      {turn.contextPreview.map((context) => (
                        <span key={`${turn.id}-${context}`} className="chat-context-pill">
                          {context}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="chat-message chat-message-agent">
                <div className="chat-message-meta">
                  <span className="chat-message-role">Shipyard</span>
                  <Badge tone={tone}>
                    <StatusDot tone={tone} pulse={turn.status === "working"} />
                    {turn.status}
                  </Badge>
                </div>
                <div className="chat-bubble chat-bubble-agent">
                  <div className="chat-bubble-body">
                    <FormattedMessage text={latestReply} />
                  </div>
                  <div className="chat-turn-footer">
                    <span>{formatStepCount(turn.activity.length)}</span>
                    {turn.langSmithTrace?.traceUrl ? (
                      <a
                        className="chat-trace-link"
                        href={turn.langSmithTrace.traceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open trace
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
