/**
 * ActivityFeed — timeline-style activity log.
 * UIV2-S04 — Turn cards with connector lines, glance rows for tool calls,
 * expandable detail, and a latest/all scope toggle.
 */

import { useState } from "react";

import {
  buildActivityBlocks, selectVisibleTurns,
  type ActivityBlockViewModel, type ActivityScope,
} from "./activity-diff.js";
import {
  Badge, MicroLabel, SectionHeader, StatusDot, SurfaceCard, type BadgeTone,
} from "./primitives.js";
import type { TurnViewModel } from "./view-models.js";

// ── Props ──────────────────────────────────────

export interface ActivityFeedProps {
  turns: TurnViewModel[];
  activityScope: ActivityScope;
  onToggleScope: (scope: ActivityScope) => void;
}

// ── Helpers ────────────────────────────────────

function getTurnTone(status: TurnViewModel["status"]): BadgeTone {
  if (status === "success") return "success";
  if (status === "error") return "danger";
  if (status === "working") return "accent";
  return "neutral";
}

function getTurnOrdinal(turnId: string, fallback: number): number {
  const match = turnId.match(/(\d+)$/);
  if (!match) return fallback;
  const parsed = Number.parseInt(match[1] ?? "", 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function formatTimestamp(isoTimestamp: string | null): string {
  if (!isoTimestamp) return "Unknown";
  const date = new Date(isoTimestamp);
  return Number.isNaN(date.getTime()) ? isoTimestamp : date.toLocaleString();
}

function formatScopeLabel(scope: ActivityScope): string {
  return scope === "latest" ? "Latest run" : "All runs";
}

function countByTone(blocks: ActivityBlockViewModel[]): {
  success: number;
  error: number;
} {
  let success = 0;
  let error = 0;
  for (const block of blocks) {
    if (block.tone === "success") success += 1;
    if (block.tone === "danger") error += 1;
  }
  return { success, error };
}

// ── Sub-components ─────────────────────────────

function GlanceRow({ block, isRunning, isExpanded, onToggle }: {
  block: ActivityBlockViewModel; isRunning: boolean;
  isExpanded: boolean; onToggle: () => void;
}) {
  return (
    <li className="activity-glance-row" data-tone={block.tone} data-running={isRunning}>
      <button type="button" className="activity-glance-trigger"
        onClick={onToggle} aria-expanded={isExpanded}>
        <span className="activity-glance-indicator"><StatusDot tone={block.tone} /></span>
        <span className="activity-glance-title">{block.title}</span>
        <Badge tone={block.tone}>{block.statusLabel}</Badge>
      </button>
      {isExpanded ? (
        <div className="activity-glance-detail">
          {block.metadata.length > 0 ? (
            <ul className="activity-block-meta">
              {block.metadata.map((item) => (
                <li key={`${block.id}-${item.label}`}>
                  <span>{item.label}</span>
                  {item.monospace ? <code>{item.value}</code> : <strong>{item.value}</strong>}
                </li>
              ))}
            </ul>
          ) : null}
          <dl className="activity-detail-list">
            {block.details.map((detail) => (
              <div key={detail.id} className="activity-detail-row" data-tone={detail.tone}>
                <dt>{detail.label}</dt>
                <dd>{detail.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </li>
  );
}

function TurnCard({
  turn,
  ordinal,
  allTurnsCount,
  defaultOpen,
}: {
  turn: TurnViewModel;
  ordinal: number;
  allTurnsCount: number;
  defaultOpen: boolean;
}) {
  const [expandedBlocks, setExpandedBlocks] = useState<Record<string, boolean>>(
    {},
  );
  const turnTone = getTurnTone(turn.status);
  const activityBlocks = buildActivityBlocks(turn.activity);
  const counts = countByTone(activityBlocks);

  function toggleBlock(blockId: string): void {
    setExpandedBlocks((current) => ({
      ...current,
      [blockId]: !current[blockId],
    }));
  }

  return (
    <li className="activity-turn-item">
      {/* Timeline connector */}
      <div className="activity-timeline-connector" data-tone={turnTone}>
        <span className="activity-timeline-dot" />
      </div>

      <SurfaceCard as="article" className="turn-card" data-tone={turnTone}>
        <div className="turn-header">
          <div className="turn-heading">
            <span className="turn-label">Turn {ordinal}</span>
            <h3>{turn.instruction}</h3>
          </div>
          <div className="turn-header-meta">
            <Badge className="turn-status-pill" tone={turnTone}>
              {turn.status}
            </Badge>
            <span className="turn-started-at">
              {formatTimestamp(turn.startedAt)}
            </span>
          </div>
        </div>

        {/* Collapsed summary */}
        <div className="turn-summary-card">
          <div className="turn-summary-counts">
            {counts.success > 0 ? (
              <Badge tone="success">{counts.success} passed</Badge>
            ) : null}
            {counts.error > 0 ? (
              <Badge tone="danger">{counts.error} failed</Badge>
            ) : null}
          </div>
          <MicroLabel>Latest summary</MicroLabel>
          <p>{turn.summary}</p>
        </div>

        {turn.contextPreview.length > 0 ? (
          <div className="turn-context-strip">
            <MicroLabel>Injected context</MicroLabel>
            {turn.contextPreview.map((entry) => <p key={entry}>{entry}</p>)}
          </div>
        ) : null}

        {turn.agentMessages.length > 0 ? (
          <div className="agent-copy">
            <MicroLabel>Agent copy</MicroLabel>
            <p>{turn.agentMessages[turn.agentMessages.length - 1]}</p>
          </div>
        ) : (
          <p className="empty-copy">No agent response yet.</p>
        )}

        {/* Tool timeline as glance rows */}
        <details
          className="activity-log"
          open={defaultOpen || turn.status === "working"}
        >
          <summary>
            <div className="activity-log-summary-copy">
              <span>Tool timeline</span>
              <small>{activityBlocks.length} grouped steps</small>
            </div>
            <div className="activity-log-summary-meta">
              <Badge tone="neutral">
                {turn.activity.length} raw events
              </Badge>
              {turn.status === "working" ? (
                <Badge tone="accent">Live</Badge>
              ) : null}
            </div>
          </summary>

          <ol className="activity-glance-list">
            {activityBlocks.map((block) => {
              const isRunning = block.statusLabel === "running";
              return (
                <GlanceRow
                  key={block.id}
                  block={block}
                  isRunning={isRunning}
                  isExpanded={expandedBlocks[block.id] === true || isRunning}
                  onToggle={() => toggleBlock(block.id)}
                />
              );
            })}
          </ol>
        </details>
      </SurfaceCard>
    </li>
  );
}

// ── Main component ─────────────────────────────

export function ActivityFeed({
  turns,
  activityScope,
  onToggleScope,
}: ActivityFeedProps) {
  const visibleTurns = selectVisibleTurns(turns, activityScope);
  const hiddenTurnCount = Math.max(turns.length - visibleTurns.length, 0);

  return (
    <SurfaceCard className="panel panel-activity">
      <SectionHeader
        kicker="Activity"
        title="Chat and execution log"
        meta={
          <div className="activity-toolbar">
            {hiddenTurnCount > 0 ? (
              <Badge tone="warning">{hiddenTurnCount} older hidden</Badge>
            ) : null}
            <div
              className="segmented-control"
              role="group"
              aria-label="Activity scope"
            >
              {(["latest", "all"] as const).map((scope) => (
                <button
                  key={scope}
                  type="button"
                  className="scope-toggle"
                  data-active={activityScope === scope}
                  onClick={() => onToggleScope(scope)}
                >
                  {formatScopeLabel(scope)}
                </button>
              ))}
            </div>
          </div>
        }
      />

      {turns.length === 0 ? (
        <div className="empty-state">
          <p className="empty-heading">Ready for the first browser turn</p>
          <p className="empty-copy">
            Start with an instruction in the center column. Add context in
            the left panel only when a spec, schema, or non-obvious rule
            should ride with that next turn.
          </p>
        </div>
      ) : (
        <ol className="turn-list activity-timeline">
          {visibleTurns.map((turn, index) => {
            const originalIndex = turns.findIndex(
              (candidate) => candidate.id === turn.id,
            );
            const ordinal = getTurnOrdinal(
              turn.id,
              originalIndex === -1
                ? visibleTurns.length - index
                : turns.length - originalIndex,
            );
            return (
              <TurnCard
                key={turn.id}
                turn={turn}
                ordinal={ordinal}
                allTurnsCount={turns.length}
                defaultOpen={index === 0}
              />
            );
          })}
        </ol>
      )}
    </SurfaceCard>
  );
}
