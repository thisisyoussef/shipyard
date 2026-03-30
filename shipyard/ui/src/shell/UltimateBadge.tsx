/**
 * UltimateBadge — Header badge showing ultimate mode status with dropdown controls.
 * UIR-T03 · Ultimate Mode Badge
 */

import { useEffect, useRef, useState } from "react";

import { formatUltimatePhaseLabel } from "../ultimate-composer.js";
import type { UltimateUiStateViewModel } from "../view-models.js";

export interface UltimateBadgeProps {
  phase: UltimateUiStateViewModel["phase"];
  turnCount: number;
  pendingFeedbackCount: number;
  currentBrief: string | null;
  lastCycleSummary: string | null;
  onSendFeedback: (text: string) => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

export function UltimateBadge({
  phase,
  turnCount,
  pendingFeedbackCount,
  currentBrief,
  lastCycleSummary,
  onSendFeedback,
  onPause,
  onResume,
  onStop,
}: UltimateBadgeProps) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const phaseLabel = formatUltimatePhaseLabel(phase);
  const canSendFeedback = phase === "running";
  const canPause = phase === "running";
  const canResume = phase === "paused";
  const canStop = phase === "running" || phase === "paused";

  /* Close dropdown on outside click */
  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function handleSend() {
    if (!canSendFeedback) return;
    const trimmed = feedback.trim();
    if (!trimmed) return;
    onSendFeedback(trimmed);
    setFeedback("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="ultimate-badge-wrapper" ref={wrapperRef}>
      <button
        type="button"
        className="navbar-ultimate-badge navbar-ultimate-badge--active"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Ultimate mode controls (${phaseLabel.toLowerCase()})`}
      >
        <span className="navbar-ultimate-dot" aria-hidden="true" />
        <span className="navbar-ultimate-label">Ultimate</span>
        <span className="navbar-ultimate-state">{phaseLabel}</span>
      </button>

      {open && (
        <div className="ultimate-dropdown" role="dialog" aria-label="Ultimate mode">
          <div className="ultimate-dropdown-section">
            <span className="ultimate-dropdown-label">Status</span>
            <span className="ultimate-dropdown-value">{phaseLabel}</span>
          </div>

          {/* Brief */}
          <div className="ultimate-dropdown-section">
            <span className="ultimate-dropdown-label">Brief</span>
            <span className="ultimate-dropdown-value">
              {currentBrief ?? "No brief set"}
            </span>
          </div>

          {/* Turn count */}
          <div className="ultimate-dropdown-section">
            <span className="ultimate-dropdown-label">Turns</span>
            <span className="ultimate-dropdown-value">{turnCount}</span>
          </div>

          <div className="ultimate-dropdown-section">
            <span className="ultimate-dropdown-label">Queued feedback</span>
            <span className="ultimate-dropdown-value">
              {String(pendingFeedbackCount)}
            </span>
          </div>

          <div className="ultimate-dropdown-section">
            <span className="ultimate-dropdown-label">Last cycle</span>
            <span className="ultimate-dropdown-value">
              {lastCycleSummary ?? "Waiting for the next cycle summary"}
            </span>
          </div>

          {/* Feedback */}
          <div className="ultimate-dropdown-section">
            <span className="ultimate-dropdown-label">Feedback</span>
            <textarea
              className="ultimate-dropdown-input"
              rows={2}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                canSendFeedback
                  ? "Send feedback... (Cmd+Enter)"
                  : phase === "stopping"
                    ? "Ultimate mode is stopping..."
                    : "Start a new loop from the editor composer to send feedback again."
              }
              disabled={!canSendFeedback}
            />
            <button
              type="button"
              className="ultimate-dropdown-send"
              onClick={handleSend}
              disabled={!canSendFeedback || !feedback.trim()}
            >
              {canSendFeedback
                ? "Send"
                : phase === "stopping"
                  ? "Stopping..."
                  : "Unavailable"}
            </button>
          </div>

          <div className="ultimate-dropdown-actions">
            <button
              type="button"
              className="ultimate-dropdown-stop"
              onClick={canResume ? onResume : onPause}
              disabled={!canPause && !canResume}
            >
              {canResume
                ? "Resume ultimate mode"
                : canPause
                  ? "Pause for manual edits"
                  : phase === "stopping"
                    ? "Stopping..."
                    : "Pause unavailable"}
            </button>
            <button
              type="button"
              className="ultimate-dropdown-stop"
              onClick={onStop}
              disabled={!canStop}
            >
              {phase === "paused"
                ? "Clear paused loop"
                : canStop
                  ? "Stop ultimate mode"
                  : "Ultimate loop is not running"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
