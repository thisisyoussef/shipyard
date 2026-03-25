/**
 * ContextPanel — Context history display.
 * UIV3-S07 · Session/Context Panels
 *
 * Shows context attachments that have been sent with instructions.
 */

import type { KeyboardEvent, RefObject } from "react";

import type { ContextReceiptViewModel } from "../view-models.js";

/* ── Props ──────────────────────────────────────── */

export interface ContextPanelProps {
  /** Context history items */
  history: ContextReceiptViewModel[];
  /** Current context draft text */
  draft: string;
  /** Callback when draft changes */
  onDraftChange: (value: string) => void;
  /** Handle keyboard events */
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  /** Callback to clear context */
  onClear: () => void;
  /** Ref for the textarea */
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

/* ── Helpers ────────────────────────────────────── */

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/* ── Component ──────────────────────────────────── */

export function ContextPanel({
  history,
  draft,
  onDraftChange,
  onKeyDown,
  onClear,
  textareaRef,
}: ContextPanelProps) {
  const hasDraft = draft.trim().length > 0;

  return (
    <div className="context-panel">
      <div className="panel-header">
        <div>
          <p className="panel-kicker">Context</p>
          <h2 className="panel-title">Attach context</h2>
        </div>
        {hasDraft && (
          <button
            type="button"
            onClick={onClear}
            style={{
              padding: "0.25rem 0.5rem",
              fontSize: "var(--text-xs)",
              color: "var(--text-muted)",
              background: "transparent",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        )}
      </div>

      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Add context that will be included with your next instruction..."
        style={{
          width: "100%",
          minHeight: "80px",
          padding: "var(--space-3)",
          fontFamily: "var(--font-body)",
          fontSize: "var(--text-sm)",
          color: "var(--text-strong)",
          background: "var(--surface-inset)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)",
          resize: "vertical",
        }}
        aria-label="Context input"
      />

      {history.length > 0 && (
        <div>
          <p
            style={{
              margin: "0 0 var(--space-2)",
              fontSize: "var(--text-xs)",
              color: "var(--text-muted)",
            }}
          >
            Previously attached ({history.length})
          </p>
          <div className="context-list">
            {history.slice(0, 5).map((item) => (
              <div key={item.id} className="context-item">
                <span className="context-item-text" title={item.text}>
                  {item.text.length > 50
                    ? `${item.text.slice(0, 50)}...`
                    : item.text}
                </span>
                {item.submittedAt && (
                  <span className="context-item-time">
                    {formatTime(item.submittedAt)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {history.length === 0 && !hasDraft && (
        <div className="context-empty">
          <p className="context-empty-text">
            Context helps the agent understand your intent. Add notes, file
            references, or requirements.
          </p>
        </div>
      )}
    </div>
  );
}
