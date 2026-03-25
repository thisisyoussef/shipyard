/**
 * ContextPanel — three-zone context manager.
 *
 * UIV2-S06 — Organizes context into three clear zones:
 *   Zone 1: Textarea input for drafting context notes
 *   Zone 2: Queued context preview (when a draft exists)
 *   Zone 3: Context history timeline (condensed entries)
 */

import { useState, type ChangeEvent, type KeyboardEvent, type RefObject } from "react";

import {
  buildTextPreview,
  DEFAULT_VISIBLE_CONTEXT_RECEIPTS,
} from "./context-ui.js";
import {
  Badge,
  MicroLabel,
  SectionHeader,
  SurfaceCard,
} from "./primitives.js";
import type { ContextReceiptViewModel } from "./view-models.js";

// ── Props ──────────────────────────────────────

export interface ContextPanelProps {
  contextDraft: string;
  contextHistory: ContextReceiptViewModel[];
  contextInputRef: RefObject<HTMLTextAreaElement | null>;
  onContextChange: (value: string) => void;
  onContextKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onClearContext: () => void;
}

// ── Helpers ────────────────────────────────────

function formatTimestamp(isoTimestamp: string | null): string {
  if (!isoTimestamp) return "Unknown";
  const date = new Date(isoTimestamp);
  return Number.isNaN(date.getTime()) ? isoTimestamp : date.toLocaleString();
}

function createContextActionCopy(
  contextDraft: string,
  contextHistory: ContextReceiptViewModel[],
): string {
  if (contextDraft.trim()) {
    return "This note is queued for the next run only. Submit with Cmd/Ctrl+Enter or clear with Escape.";
  }
  if (contextHistory.length > 0) {
    return "Shipyard keeps receipts for recent injected context so reloads never erase what you told it.";
  }
  return "Add a spec excerpt, schema, or repo-specific constraint only when the next turn truly needs it.";
}

function handleTextareaChange(
  event: ChangeEvent<HTMLTextAreaElement>,
  onChange: (value: string) => void,
): void {
  onChange((event.currentTarget as HTMLTextAreaElement).value);
}

// ── Component ──────────────────────────────────

export function ContextPanel({
  contextDraft,
  contextHistory,
  contextInputRef,
  onContextChange,
  onContextKeyDown,
  onClearContext,
}: ContextPanelProps) {
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [showAllHistory, setShowAllHistory] = useState(false);

  const trimmedDraft = contextDraft.trim();
  const queuedPreview = trimmedDraft
    ? buildTextPreview(trimmedDraft, expandedItems["queued-context"] === true)
    : null;

  const visibleHistory = showAllHistory
    ? contextHistory
    : contextHistory.slice(0, DEFAULT_VISIBLE_CONTEXT_RECEIPTS);
  const hiddenHistoryCount = Math.max(
    contextHistory.length - visibleHistory.length,
    0,
  );

  function toggleExpansion(id: string): void {
    setExpandedItems((current) => ({
      ...current,
      [id]: !current[id],
    }));
  }

  return (
    <SurfaceCard className="panel panel-context">
      <SectionHeader
        kicker="Context"
        title="Inject guidance"
        meta={
          <button
            type="button"
            className="ghost-action"
            onClick={onClearContext}
          >
            Clear
          </button>
        }
      />

      {/* Zone 2: Queued context preview */}
      {queuedPreview ? (
        <div className="context-receipt-card queued-context-card">
          <div className="context-receipt-header">
            <div>
              <MicroLabel>Queued for next turn</MicroLabel>
              <h3>Pending context note</h3>
            </div>
            <Badge tone="accent">Draft</Badge>
          </div>
          <p>{queuedPreview.text}</p>
          <div className="context-receipt-meta">
            <span>{trimmedDraft.length} characters</span>
            {queuedPreview.isTruncated ? (
              <button
                type="button"
                className="ghost-action context-toggle"
                onClick={() => toggleExpansion("queued-context")}
              >
                {expandedItems["queued-context"]
                  ? "Show less"
                  : "Show full context"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Zone 1: Context textarea input */}
      <label className="field-label" htmlFor="context-draft">
        Notes that will ride with the next instruction
      </label>
      <textarea
        id="context-draft"
        ref={contextInputRef}
        className="context-input"
        value={contextDraft}
        onChange={(event) => handleTextareaChange(event, onContextChange)}
        onKeyDown={onContextKeyDown}
        aria-keyshortcuts="Control+Enter Meta+Enter Escape"
        placeholder="Paste a spec excerpt, acceptance note, or local constraint."
        rows={6}
      />
      <p className="support-copy">
        {createContextActionCopy(contextDraft, contextHistory)}
      </p>

      {/* Zone 3: Context history timeline */}
      {visibleHistory.length > 0 ? (
        <div className="context-history-block">
          <div className="context-history-header">
            <MicroLabel>Recent injections</MicroLabel>
            {hiddenHistoryCount > 0 ? (
              <button
                type="button"
                className="ghost-action context-toggle"
                onClick={() => setShowAllHistory((current) => !current)}
              >
                {showAllHistory
                  ? "Show fewer receipts"
                  : `Show ${String(hiddenHistoryCount)} older receipt${hiddenHistoryCount === 1 ? "" : "s"}`}
              </button>
            ) : null}
          </div>
          <ol className="context-history-list">
            {visibleHistory.map((entry) => {
              const preview = buildTextPreview(
                entry.text,
                expandedItems[entry.id] === true,
              );
              return (
                <li key={entry.id} className="context-history-item">
                  <div className="context-history-item-header">
                    <time
                      className="context-history-time"
                      dateTime={entry.submittedAt}
                    >
                      {formatTimestamp(entry.submittedAt)}
                    </time>
                    <Badge tone="neutral">{entry.turnId}</Badge>
                  </div>
                  <p>{preview.text}</p>
                  {preview.isTruncated ? (
                    <button
                      type="button"
                      className="ghost-action context-toggle"
                      onClick={() => toggleExpansion(entry.id)}
                    >
                      {expandedItems[entry.id]
                        ? "Show less"
                        : "Show full context"}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      ) : (
        <div className="empty-state compact-empty-state">
          <p className="empty-heading">No context attached yet</p>
          <p className="empty-copy">
            Add a spec excerpt or repo-specific rule here when the next turn
            needs more than the current repository state.
          </p>
        </div>
      )}
    </SurfaceCard>
  );
}
