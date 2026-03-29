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
import { UltimateToggle } from "../shell/UltimateToggle.js";
import type { WorkbenchComposerBehavior } from "../ultimate-composer.js";

/* ── Types ──────────────────────────────────────── */

export type ComposerState = "idle" | "drafting" | "submitting" | "busy";

export interface ComposerNotice {
  tone: BadgeTone;
  title: string;
  detail: string;
}

export interface ComposerAttachment {
  id: string;
  label: string;
  detail: string;
  status: "uploading" | "attached" | "rejected";
  error?: string;
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
  /** Pending upload badges and local upload statuses */
  attachments?: ComposerAttachment[];
  /** Callback to open the file picker and upload files */
  onAttachFiles?: (files: File[]) => void;
  /** Callback to remove a pending or rejected attachment */
  onRemoveAttachment?: (attachmentId: string) => void;
  /** Derived composer behavior for standard and ultimate flows */
  composerBehavior?: WorkbenchComposerBehavior;
  /** Toggle ultimate-mode arming for the next send */
  onUltimateToggle?: () => void;
}

const DEFAULT_BEHAVIOR: WorkbenchComposerBehavior = {
  mode: "instruction",
  submitLabel: "Run instruction",
  placeholder:
    "Ask Shipyard to inspect a file, explain the current diff, or map the next change.",
  keyboardHint: "Cmd+Enter to send",
  modeSummary: "Next send runs a normal Shipyard instruction.",
  showCancelAction: false,
  submitDisabled: false,
  togglePressed: false,
  toggleDisabled: false,
};

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
  attachments = [],
  onAttachFiles,
  onRemoveAttachment,
  composerBehavior = DEFAULT_BEHAVIOR,
  onUltimateToggle,
}: ComposerPanelProps) {
  const [isFocused, setIsFocused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
    state === "submitting" ? "Sending..." : composerBehavior.submitLabel;

  const handleFocus = useCallback(() => setIsFocused(true), []);
  const handleBlur = useCallback(() => setIsFocused(false), []);
  const handleOpenFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  const handleFileSelection = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.currentTarget.files ?? []);

      if (files.length > 0) {
        onAttachFiles?.(files);
      }

      event.currentTarget.value = "";
    },
    [onAttachFiles],
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
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          className="composer-file-input"
          type="file"
          multiple
          onChange={handleFileSelection}
          tabIndex={-1}
          aria-hidden="true"
        />

        <div className="composer-mode-row">
          <UltimateToggle
            enabled={composerBehavior.togglePressed}
            disabled={composerBehavior.toggleDisabled}
            onToggle={() => onUltimateToggle?.()}
          />
          <div className="composer-mode-copy">
            <span className="composer-mode-label">
              {composerBehavior.mode === "ultimate-feedback"
                ? "Loop feedback"
                : composerBehavior.mode === "ultimate-start"
                  ? "Loop brief"
                  : composerBehavior.mode === "ultimate-stopping"
                    ? "Loop stopping"
                    : "Standard turn"}
            </span>
            <p id="composer-mode-summary" className="composer-mode-summary">
              {composerBehavior.modeSummary}
            </p>
          </div>
        </div>

        {attachments.length > 0 && (
          <div
            className="composer-context-badges"
            role="list"
            aria-label="Pending uploads"
          >
            {attachments.map((attachment) => (
              <span
                key={attachment.id}
                className="composer-context-badge"
                data-status={attachment.status}
                role="listitem"
              >
                <code
                  title={attachment.detail}
                  aria-label={`Attachment: ${attachment.label}`}
                >
                  {attachment.label.length > 24
                    ? `${attachment.label.slice(0, 12)}...${attachment.label.slice(-9)}`
                    : attachment.label}
                </code>
                <span className="composer-context-status">
                  {attachment.status === "uploading"
                    ? "Uploading..."
                    : attachment.status === "rejected"
                      ? attachment.error ?? "Upload failed"
                      : "Attached"}
                </span>
                {onRemoveAttachment && attachment.status !== "uploading" && (
                  <button
                    type="button"
                    className="composer-context-dismiss"
                    aria-label={`Remove ${attachment.label}`}
                    onClick={() => onRemoveAttachment(attachment.id)}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        <div className="composer-input-row">
          {/* Attach button inside input row, left of textarea */}
          <button
            type="button"
            className="composer-attach"
            onClick={handleOpenFilePicker}
            disabled={!onAttachFiles}
            aria-disabled={!onAttachFiles}
            aria-label="Attach files"
            title="Attach files"
          >
            +
          </button>

          <textarea
            ref={textareaRef}
            className="composer-textarea"
            value={instruction}
            onChange={(e) => onInstructionChange(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={composerBehavior.placeholder}
            aria-label="Instruction input"
            aria-multiline="true"
            aria-keyshortcuts="Control+Enter Meta+Enter"
            aria-describedby="composer-mode-summary"
            data-state={state}
          />

          {/* Submit button attached to textarea */}
          {composerBehavior.showCancelAction ? (
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
              disabled={submitting || composerBehavior.submitDisabled}
              aria-disabled={submitting || composerBehavior.submitDisabled}
            >
              {submitLabel}
            </button>
          )}
        </div>
      </form>

      {/* Keyboard hint below */}
      <span className="composer-keyboard-hint">
        {composerBehavior.keyboardHint} · Up/Down for history
      </span>
    </div>
  );
}
