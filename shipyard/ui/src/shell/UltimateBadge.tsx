/**
 * UltimateBadge — Header badge showing ultimate mode status with dropdown controls.
 * UIR-T03 · Ultimate Mode Badge
 */

import { useEffect, useRef, useState } from "react";

export interface UltimateBadgeProps {
  active: boolean;
  turnCount: number;
  currentBrief: string | null;
  onSendFeedback: (text: string) => void;
  onStop: () => void;
}

export function UltimateBadge({
  active,
  turnCount,
  currentBrief,
  onSendFeedback,
  onStop,
}: UltimateBadgeProps) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

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

  if (!active) return null;

  function handleSend() {
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
        aria-label="Ultimate mode controls"
      >
        <span className="navbar-ultimate-dot" aria-hidden="true" />
        <span className="navbar-ultimate-label">Ultimate</span>
      </button>

      {open && (
        <div className="ultimate-dropdown" role="dialog" aria-label="Ultimate mode">
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

          {/* Feedback */}
          <div className="ultimate-dropdown-section">
            <span className="ultimate-dropdown-label">Feedback</span>
            <textarea
              className="ultimate-dropdown-input"
              rows={2}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Send feedback... (Cmd+Enter)"
            />
            <button
              type="button"
              className="ultimate-dropdown-send"
              onClick={handleSend}
              disabled={!feedback.trim()}
            >
              Send
            </button>
          </div>

          {/* Stop */}
          <button
            type="button"
            className="ultimate-dropdown-stop"
            onClick={onStop}
          >
            Stop Ultimate Mode
          </button>
        </div>
      )}
    </div>
  );
}
