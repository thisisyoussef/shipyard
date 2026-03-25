/**
 * ComposerPanel — Instruction input with auto-resize and history.
 * UIV3-S04 · Composer UX
 *
 * Command surface for user instructions. Auto-resizing textarea,
 * context badges, keyboard shortcuts, and visual state machine.
 */

import type { ChangeEvent, FormEvent, KeyboardEvent, RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { BadgeTone } from "../primitives.js";
import { Badge } from "../primitives.js";
import type { PendingUploadReceiptViewModel } from "../view-models.js";

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
  /** Callback when the current turn should be cancelled */
  onCancel?: () => void;
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
  /** Uploaded file receipts waiting for the next turn */
  pendingUploads?: PendingUploadReceiptViewModel[];
  /** Whether file uploads are temporarily unavailable */
  uploadsDisabled?: boolean;
  /** Callback when the user selects local files to upload */
  onUploadFiles?: (files: File[]) => void;
  /** Callback to remove a pending upload before the next turn */
  onRemoveUpload?: (receiptId: string) => void;
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
  onCancel,
  onKeyDown,
  textareaRef,
  agentBusy = false,
  submitting = false,
  notice,
  pendingUploads = [],
  uploadsDisabled = false,
  onUploadFiles,
  onRemoveUpload,
}: ComposerPanelProps) {
  const [isFocused, setIsFocused] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

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
  const submitLabel = state === "submitting" ? "Sending..." : "Run instruction";

  const handleFocus = useCallback(() => setIsFocused(true), []);
  const handleBlur = useCallback(() => setIsFocused(false), []);
  const handleUploadPicker = useCallback(() => {
    uploadInputRef.current?.click();
  }, []);
  const handleUploadChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = event.target.files
        ? Array.from(event.target.files)
        : [];

      if (selectedFiles.length > 0) {
        onUploadFiles?.(selectedFiles);
      }

      event.target.value = "";
    },
    [onUploadFiles],
  );

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

        <div className="composer-toolbar">
          <button
            type="button"
            className="composer-attach"
            onClick={handleUploadPicker}
            disabled={uploadsDisabled}
            aria-disabled={uploadsDisabled}
          >
            Attach files
          </button>
          <input
            ref={uploadInputRef}
            type="file"
            multiple
            hidden
            onChange={handleUploadChange}
          />
        </div>

        {/* Pending upload badges */}
        {pendingUploads.length > 0 && (
          <div
            className="composer-context-badges"
            role="list"
            aria-label="Pending uploaded files"
          >
            {pendingUploads.map((upload) => (
              <span
                key={upload.id}
                className="composer-context-badge"
                role="listitem"
              >
                <code
                  title={upload.targetRelativePath ?? upload.originalName}
                  aria-label={`Pending uploaded file: ${upload.originalName}`}
                >
                  {upload.originalName.length > 24
                    ? `${upload.originalName.slice(0, 12)}...${upload.originalName.slice(-9)}`
                    : upload.originalName}
                </code>
                {onRemoveUpload && (
                  <button
                    type="button"
                    className="composer-context-dismiss"
                    aria-label={`Remove ${upload.originalName} before the next turn`}
                    onClick={() => onRemoveUpload(upload.id)}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        {/* Submit button attached to textarea */}
        {agentBusy ? (
          <button
            type="button"
            className="composer-submit"
            onClick={onCancel}
            disabled={!onCancel}
            aria-disabled={!onCancel}
          >
            Cancel turn
          </button>
        ) : (
          <button
            type="submit"
            className="composer-submit"
            disabled={submitting}
            aria-disabled={submitting}
          >
            {submitLabel}
          </button>
        )}
      </form>

      {/* Keyboard hint below */}
      <span className="composer-keyboard-hint">
        Cmd+Enter to send · Up/Down for history
      </span>
    </div>
  );
}
