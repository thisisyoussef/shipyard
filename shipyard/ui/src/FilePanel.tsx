/**
 * FilePanel — file activity sidebar with diff viewer.
 *
 * UIV2-S05 — Groups file events by status, renders diffs with line
 * numbers alongside ADD/DEL/CTX/META labels, supports paginated diff
 * expansion, and copyable file paths.
 */

import { useState } from "react";

import {
  buildDiffPreview,
  type ActivityScope,
  type DiffRenderLineViewModel,
} from "./activity-diff.js";
import {
  Badge,
  MicroLabel,
  SectionHeader,
  SurfaceCard,
  type BadgeTone,
} from "./primitives.js";
import type { FileEventViewModel } from "./view-models.js";

// ── Props ──────────────────────────────────────

export interface FilePanelProps {
  visibleFileEvents: FileEventViewModel[];
  totalFileEventCount: number;
  hiddenFileEventCount: number;
  activityScope: ActivityScope;
}

// ── Helpers ────────────────────────────────────

function getFileEventTone(status: FileEventViewModel["status"]): BadgeTone {
  if (status === "success") return "success";
  if (status === "error") return "danger";
  if (status === "diff" || status === "running") return "accent";
  return "neutral";
}

function formatScopeLabel(scope: ActivityScope): string {
  return scope === "latest" ? "Latest run" : "All runs";
}

function createHiddenCopy(
  scope: ActivityScope,
  hiddenCount: number,
): string {
  if (scope === "latest" && hiddenCount > 0) {
    return `The latest run has no file activity yet. Switch to all runs to review ${String(hiddenCount)} earlier item${hiddenCount === 1 ? "" : "s"}.`;
  }
  return "Reads, edits, and diff previews will land here as soon as the next turn touches the repository.";
}

function groupByStatus(
  events: FileEventViewModel[],
): Array<{ status: string; tone: BadgeTone; events: FileEventViewModel[] }> {
  const order: FileEventViewModel["status"][] = [
    "running",
    "diff",
    "error",
    "success",
  ];
  const buckets = new Map<string, FileEventViewModel[]>();

  for (const event of events) {
    const existing = buckets.get(event.status);
    if (existing) {
      existing.push(event);
    } else {
      buckets.set(event.status, [event]);
    }
  }

  const groups: Array<{
    status: string;
    tone: BadgeTone;
    events: FileEventViewModel[];
  }> = [];

  for (const status of order) {
    const items = buckets.get(status);
    if (items && items.length > 0) {
      groups.push({
        status,
        tone: getFileEventTone(status),
        events: items,
      });
    }
  }

  return groups;
}

async function copyToClipboard(text: string): Promise<void> {
  if ("clipboard" in navigator) {
    await navigator.clipboard.writeText(text);
  }
}

// ── Sub-components ─────────────────────────────

function DiffLineRow({
  line,
  lineNumber,
}: {
  line: DiffRenderLineViewModel;
  lineNumber: number;
}) {
  return (
    <li className="diff-render-line" data-kind={line.kind}>
      <span className="diff-line-number" aria-hidden="true">
        {lineNumber}
      </span>
      <span className="diff-line-label">{line.label}</span>
      <code className="diff-line-text">{line.text || " "}</code>
    </li>
  );
}

function FileEventCard({
  fileEvent,
  expanded,
  onToggleDiff,
}: {
  fileEvent: FileEventViewModel;
  expanded: boolean;
  onToggleDiff: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const diffPreview = buildDiffPreview(fileEvent, expanded);
  const tone = getFileEventTone(fileEvent.status);

  function handleCopyPath(): void {
    void copyToClipboard(fileEvent.path).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  }

  return (
    <SurfaceCard as="article" className="file-event-card" data-tone={tone}>
      <div className="file-event-header">
        <div>
          <span className="file-event-title">{fileEvent.title}</span>
          <h3
            className="file-event-path"
            title="Click to copy path"
            onClick={handleCopyPath}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") handleCopyPath();
            }}
          >
            {fileEvent.path}
            {copied ? (
              <span className="file-event-copied-hint">Copied</span>
            ) : null}
          </h3>
        </div>
        <Badge className="file-event-status" tone={tone}>
          {fileEvent.status}
        </Badge>
      </div>

      <div className="file-event-meta-row">
        {fileEvent.toolName ? <code>{fileEvent.toolName}</code> : null}
        <span>{fileEvent.turnId}</span>
      </div>
      <p className="file-event-summary">{fileEvent.summary}</p>

      {fileEvent.diffLines.length > 0 ? (
        <div className="diff-preview-shell">
          <div className="diff-legend">
            <Badge tone="success">ADD</Badge>
            <Badge tone="danger">DEL</Badge>
            <Badge tone="neutral">CTX</Badge>
            <Badge tone="warning">META</Badge>
            <span>{diffPreview.totalLineCount} lines</span>
          </div>

          <ol
            className="diff-line-list"
            aria-label={`Diff preview for ${fileEvent.path}`}
          >
            {diffPreview.lines.map((line, index) => (
              <DiffLineRow
                key={line.id}
                line={line}
                lineNumber={index + 1}
              />
            ))}
          </ol>

          {diffPreview.hasOverflow ? (
            <button
              type="button"
              className="ghost-action diff-toggle"
              onClick={onToggleDiff}
            >
              {expanded
                ? "Show fewer lines"
                : `Show ${String(diffPreview.hiddenLineCount)} more lines`}
            </button>
          ) : null}
        </div>
      ) : null}
    </SurfaceCard>
  );
}

// ── Main component ─────────────────────────────

export function FilePanel({
  visibleFileEvents,
  totalFileEventCount,
  hiddenFileEventCount,
  activityScope,
}: FilePanelProps) {
  const [expandedDiffs, setExpandedDiffs] = useState<Record<string, boolean>>(
    {},
  );

  function toggleDiff(fileEventId: string): void {
    setExpandedDiffs((current) => ({
      ...current,
      [fileEventId]: !current[fileEventId],
    }));
  }

  const groups = groupByStatus(visibleFileEvents);

  return (
    <SurfaceCard className="panel panel-files">
      <SectionHeader
        kicker="File activity"
        title="Diff-first sidebar"
        meta={
          <div className="file-panel-meta">
            <Badge tone="neutral">{visibleFileEvents.length} items</Badge>
            {hiddenFileEventCount > 0 ? (
              <Badge tone="warning">{hiddenFileEventCount} hidden</Badge>
            ) : null}
          </div>
        }
      />

      {visibleFileEvents.length === 0 ? (
        <div className="empty-state compact-empty-state">
          <p className="empty-heading">
            No file events in {formatScopeLabel(activityScope).toLowerCase()}
          </p>
          <p className="empty-copy">
            {createHiddenCopy(activityScope, hiddenFileEventCount)}
          </p>
        </div>
      ) : (
        <div className="file-event-groups">
          {groups.map((group) => (
            <div key={group.status} className="file-event-group">
              <div className="file-event-group-header">
                <MicroLabel>{group.status}</MicroLabel>
                <Badge tone={group.tone}>{group.events.length}</Badge>
              </div>
              <ol className="file-event-list">
                {group.events.map((fileEvent) => (
                  <li key={fileEvent.id}>
                    <FileEventCard
                      fileEvent={fileEvent}
                      expanded={expandedDiffs[fileEvent.id] === true}
                      onToggleDiff={() => toggleDiff(fileEvent.id)}
                    />
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </SurfaceCard>
  );
}
