/**
 * ComposerPanel — Instruction input with auto-resize and history.
 * UIV3-S04 · Composer UX
 *
 * Command surface for user instructions. Auto-resizing textarea,
 * context badges, keyboard shortcuts, and visual state machine.
 */

import type { FormEvent, KeyboardEvent, RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { BadgeTone } from "../primitives.js";
import { Badge } from "../primitives.js";

/* ── Types ──────────────────────────────────────── */

export type ComposerState = "idle" | "drafting" | "submitting" | "busy";

export interface ComposerNotice {
  tone: BadgeTone;
  title: string;
  detail: string;
}

export interface ComposerPanelProps {
  /** Current instruction text */
  instruction: string;
  /** Callback when instruction changes */
  onInstructionChange: (value: string) => void;
  /** Callback when form is submitted */
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  /** Handle keyboard events (Enter, history navigation) */
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  /** Ref to the textarea for external focus management */
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  /** Whether the agent is busy (disables submit) */
  agentBusy?: boolean;
  /** Whether currently submitting */
  submitting?: boolean;
  /** Notice to display above textarea */
  notice?: ComposerNotice | null;
  /** Attached context file names */
  contextFiles?: string[];
  /** Callback to remove a context file */
  onRemoveContext?: (filename: string) => void;
}

/* ── Auto-resize hook ───────────────────────────── */

function useAutoResize(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Reset height to auto to get accurate scrollHeight
    el.style.height = "auto";
    // Clamp between min and max
    const minHeight = 56;
    const maxHeight = 240;
    const newHeight = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight);
    el.style.height = `${newHeight}px`;
  }, [ref, value]);
}

/* ── Component ──────────────────────────────────── */

export function ComposerPanel({
  instruction,
  onInstructionChange,
  onSubmit,
  onKeyDown,
  textareaRef,
  agentBusy = false,
  submitting = false,
  notice,
  contextFiles = [],
  onRemoveContext,
}: ComposerPanelProps) {
  const [isFocused, setIsFocused] = useState(false);

  // Auto-resize textarea
  useAutoResize(textareaRef, instruction);

  // Derive visual state
  const state: ComposerState = submitting
    ? "submitting"
    : agentBusy
      ? "busy"
      : instruction.length > 0 || isFocused
        ? "drafting"
        : "idle";

  // Submit button label
  const submitLabel =
    state === "submitting"
      ? "Sending..."
      : state === "busy"
        ? "Working..."
        : "Run instruction";

  const handleFocus = useCallback(() => setIsFocused(true), []);
  const handleBlur = useCallback(() => setIsFocused(false), []);

  return (
    <div className="composer-shell" role="form" data-state={state}>
      {/* Notice banner */}
      {notice && (
        <div
          className="composer-notice"
          data-tone={notice.tone}
          role={notice.tone === "danger" ? "alert" : "status"}
          aria-live={notice.tone === "danger" ? "assertive" : "polite"}
        >
          <div className="composer-notice-header">
            <Badge tone={notice.tone}>{notice.title}</Badge>
          </div>
          <p>{notice.detail}</p>
        </div>
      )}

      {/* Textarea container with integrated submit */}
      <form onSubmit={onSubmit} className="composer-textarea-container">
        <textarea
          ref={textareaRef}
          className="composer-textarea"
          value={instruction}
          onChange={(e) => onInstructionChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="Ask Shipyard to inspect a file, explain the current diff, or map the next change."
          aria-label="Instruction input"
          aria-multiline="true"
          aria-keyshortcuts="Control+Enter Meta+Enter"
          data-state={state}
        />

        {/* Context badges */}
        {contextFiles.length > 0 && (
          <div
            className="composer-context-badges"
            role="list"
            aria-label="Attached context"
          >
            {contextFiles.map((file) => (
              <span key={file} className="composer-context-badge" role="listitem">
                <code
                  title={file}
                  aria-label={`Attached context: ${file}`}
                >
                  {file.length > 24
                    ? `${file.slice(0, 12)}...${file.slice(-9)}`
                    : file}
                </code>
                {onRemoveContext && (
                  <button
                    type="button"
                    className="composer-context-dismiss"
                    aria-label={`Remove ${file} from context`}
                    onClick={() => onRemoveContext(file)}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        {/* Submit button attached to textarea */}
        <button
          type="submit"
          className="composer-submit"
          disabled={agentBusy || submitting}
          aria-disabled={agentBusy || submitting}
        >
          {submitLabel}
        </button>
      </form>

      {/* Keyboard hint below */}
      <span className="composer-keyboard-hint">
        Cmd+Enter to send · Up/Down for history
      </span>
    </div>
  );
}
