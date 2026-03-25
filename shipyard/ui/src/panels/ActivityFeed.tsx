/**
 * ActivityFeed — Timeline of agent turns and tool calls.
 * UIV3-S05 · Activity Feed
 *
 * Shows turn history with instruction, status, summary,
 * and expandable tool call details.
 */

import type { ReactNode } from "react";
import { useState } from "react";

import {
  buildActivityBlocks,
  type ActivityBlockViewModel,
  type ActivityScope,
  selectVisibleTurns,
} from "../activity-diff.js";
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
    case "cancelled":
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

function getBlockMetaValue(
  block: ActivityBlockViewModel,
  label: string,
): string | null {
  return block.metadata.find((item) => item.label === label)?.value ?? null;
}

/* ── Component ──────────────────────────────────── */

export function ActivityFeed({ turns, emptyContent }: ActivityFeedProps) {
  const [scope, setScope] = useState<ActivityScope>("latest");
  const [expandedBlocks, setExpandedBlocks] = useState<Record<string, boolean>>(
    {},
  );
  const visibleTurns = selectVisibleTurns(turns, scope);
  const hiddenTurnCount = Math.max(turns.length - visibleTurns.length, 0);

  const toggleBlock = (blockId: string) => {
    setExpandedBlocks((current) => ({
      ...current,
      [blockId]: !current[blockId],
    }));
  };

  if (turns.length === 0) {
    return (
      <div className="activity-panel">
        <div className="activity-panel-header">
          <div>
            <p className="panel-kicker">Activity</p>
            <h2 className="activity-panel-title">Chat and execution log</h2>
          </div>
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
        <div>
          <p className="panel-kicker">Activity</p>
          <h2 className="activity-panel-title">Chat and execution log</h2>
        </div>

        <div className="activity-panel-actions">
          {scope === "latest" && hiddenTurnCount > 0 ? (
            <Badge tone="neutral">{hiddenTurnCount} older turns hidden</Badge>
          ) : null}
          <div className="activity-scope-toggle" role="group" aria-label="Activity scope">
            <button
              type="button"
              className="activity-scope-button"
              data-active={scope === "latest"}
              aria-pressed={scope === "latest"}
              onClick={() => setScope("latest")}
            >
              Latest run
            </button>
            <button
              type="button"
              className="activity-scope-button"
              data-active={scope === "all"}
              aria-pressed={scope === "all"}
              onClick={() => setScope("all")}
            >
              All runs
            </button>
          </div>
        </div>
      </div>

      <div className="activity-timeline" role="feed" aria-label="Activity feed">
        {visibleTurns.map((turn, index) => {
          const tone = getTurnTone(turn.status);
          const isWorking = turn.status === "working";
          const activityBlocks = buildActivityBlocks(turn.activity ?? []);

          return (
            <article
              key={turn.id}
              className="activity-turn"
              data-status={turn.status}
              aria-labelledby={`turn-${turn.id}-instruction`}
            >
              <div className="activity-turn-header">
                <div className="activity-turn-copy">
                  <p className="activity-turn-kicker">
                    {index === 0 ? "Current turn" : `Turn ${String(turns.length - index)}`}
                  </p>
                  <h3
                    id={`turn-${turn.id}-instruction`}
                    className="activity-turn-instruction"
                  >
                    {turn.instruction}
                  </h3>
                </div>
                <div className="activity-turn-status">
                  <Badge tone={tone}>
                    <StatusDot tone={tone} pulse={isWorking} />
                    {turn.status}
                  </Badge>
                </div>
              </div>

              {turn.summary && (
                <p className="activity-turn-summary">{turn.summary}</p>
              )}

              {turn.contextPreview.length > 0 ? (
                <div className="activity-turn-context">
                  <span className="activity-turn-context-label">
                    Injected context
                  </span>
                  <p className="activity-turn-context-text">
                    {turn.contextPreview[0]}
                  </p>
                </div>
              ) : null}

              {turn.agentMessages.length > 0 &&
              turn.agentMessages[turn.agentMessages.length - 1] !== turn.summary ? (
                <div className="activity-turn-agent-note">
                  <span className="activity-turn-context-label">Latest reply</span>
                  <p className="activity-turn-context-text">
                    {turn.agentMessages[turn.agentMessages.length - 1]}
                  </p>
                </div>
              ) : null}

              <div className="activity-turn-meta">
                {turn.startedAt && (
                  <time dateTime={turn.startedAt}>
                    {formatTime(turn.startedAt)}
                  </time>
                )}
                {activityBlocks.length > 0 && (
                  <span>{activityBlocks.length} grouped steps</span>
                )}
              </div>

              {activityBlocks.length > 0 ? (
                <div className="activity-block-list" aria-label="Turn timeline">
                  {activityBlocks.map((block) => {
                    const blockPath = getBlockMetaValue(block, "Path");
                    const isExpanded = expandedBlocks[block.id] ?? index === 0;

                    return (
                      <section
                        key={block.id}
                        className="activity-block"
                        data-kind={block.kind}
                        data-expanded={isExpanded}
                      >
                        <button
                          type="button"
                          className="activity-block-toggle"
                          onClick={() => toggleBlock(block.id)}
                          aria-expanded={isExpanded}
                          aria-label={`${block.headline}, ${block.statusLabel}`}
                        >
                          <div className="activity-block-leading">
                            <StatusDot
                              tone={block.tone}
                              pulse={block.statusLabel === "running"}
                            />
                            <div className="activity-block-copy">
                              <span className="activity-block-headline">
                                {block.headline}
                              </span>
                              <span className="activity-block-preview">
                                {block.preview}
                              </span>
                              {blockPath ? (
                                <code className="activity-block-path">
                                  {blockPath}
                                </code>
                              ) : null}
                            </div>
                          </div>
                          <div className="activity-block-trailing">
                            <Badge tone={block.tone}>{block.statusLabel}</Badge>
                            <span className="activity-block-chevron" aria-hidden="true">
                              {isExpanded ? "−" : "+"}
                            </span>
                          </div>
                        </button>

                        {isExpanded ? (
                          <div className="activity-block-body">
                            {block.metadata.length > 0 ? (
                              <dl className="activity-block-metadata">
                                {block.metadata.map((item) => (
                                  <div key={`${block.id}-${item.label}`}>
                                    <dt>{item.label}</dt>
                                    <dd data-monospace={item.monospace}>
                                      {item.value}
                                    </dd>
                                  </div>
                                ))}
                              </dl>
                            ) : null}

                            <div className="activity-block-details">
                              {block.details.map((detail) => (
                                <div
                                  key={detail.id}
                                  className="activity-block-detail"
                                  data-tone={detail.tone}
                                >
                                  <span className="activity-block-detail-label">
                                    {detail.label}
                                  </span>
                                  <p className="activity-block-detail-text">
                                    {detail.text}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
