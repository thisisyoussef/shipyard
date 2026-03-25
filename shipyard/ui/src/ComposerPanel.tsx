/**
 * ComposerPanel — command-palette style instruction composer.
 *
 * UIV2-S03 — Replaces the static form with an auto-resizing textarea,
 * instruction history navigation (up/down arrows), visual state
 * indicators, and inline context badge.
 *
 * Exports two hooks:
 *   useAutoResize  — measures scrollHeight and adjusts textarea height
 *   useInstructionHistory — stores last 20 instructions, navigates with arrows
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";

import {
  Badge,
  SectionHeader,
  StatusDot,
  SurfaceCard,
  type BadgeTone,
} from "./primitives.js";
import type { WorkbenchConnectionState } from "./view-models.js";

// ── Types ──────────────────────────────────────

export interface ComposerNotice {
  tone: BadgeTone;
  title: string;
  detail: string;
}

type ComposerVisualState = "idle" | "composing" | "submitting" | "busy";

export interface ComposerPanelProps {
  instruction: string;
  contextDraft: string;
  connectionState: WorkbenchConnectionState;
  composerNotice: ComposerNotice | null;
  instructionInputRef: RefObject<HTMLTextAreaElement | null>;
  onInstructionChange: (value: string) => void;
  onSubmitInstruction: (event: FormEvent<HTMLFormElement>) => void;
  onInstructionKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
}

// ── useAutoResize hook ─────────────────────────

const MIN_HEIGHT = 56;
const MAX_HEIGHT = 240;

export function useAutoResize(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
): void {
  useEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;

    // Reset height to measure natural scroll height
    textarea.style.height = "auto";
    const scrollHeight = textarea.scrollHeight;
    const clamped = Math.min(Math.max(scrollHeight, MIN_HEIGHT), MAX_HEIGHT);
    textarea.style.height = `${String(clamped)}px`;
    textarea.style.overflowY = scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
  }, [ref, value]);
}

// ── useInstructionHistory hook ─────────────────

const HISTORY_LIMIT = 20;

export function useInstructionHistory(): {
  push: (instruction: string) => void;
  navigateUp: () => string | null;
  navigateDown: () => string | null;
  resetCursor: () => void;
} {
  const historyRef = useRef<string[]>([]);
  const cursorRef = useRef(-1);

  const push = useCallback((instruction: string) => {
    const trimmed = instruction.trim();
    if (!trimmed) return;

    // Deduplicate head
    if (historyRef.current[0] === trimmed) return;

    historyRef.current = [trimmed, ...historyRef.current].slice(0, HISTORY_LIMIT);
    cursorRef.current = -1;
  }, []);

  const navigateUp = useCallback((): string | null => {
    const history = historyRef.current;
    if (history.length === 0) return null;

    const nextCursor = Math.min(cursorRef.current + 1, history.length - 1);
    cursorRef.current = nextCursor;
    return history[nextCursor] ?? null;
  }, []);

  const navigateDown = useCallback((): string | null => {
    if (cursorRef.current <= 0) {
      cursorRef.current = -1;
      return "";
    }

    cursorRef.current -= 1;
    return historyRef.current[cursorRef.current] ?? null;
  }, []);

  const resetCursor = useCallback(() => {
    cursorRef.current = -1;
  }, []);

  return { push, navigateUp, navigateDown, resetCursor };
}

// ── Helpers ────────────────────────────────────

function deriveVisualState(
  connectionState: WorkbenchConnectionState,
  instruction: string,
): ComposerVisualState {
  if (connectionState === "agent-busy") return "busy";
  if (instruction.trim().length > 0) return "composing";
  return "idle";
}

function handleTextareaChange(
  event: ChangeEvent<HTMLTextAreaElement>,
  onChange: (value: string) => void,
): void {
  onChange((event.currentTarget as HTMLTextAreaElement).value);
}

// ── Component ──────────────────────────────────

export function ComposerPanel({
  instruction,
  contextDraft,
  connectionState,
  composerNotice,
  instructionInputRef,
  onInstructionChange,
  onSubmitInstruction,
  onInstructionKeyDown,
}: ComposerPanelProps) {
  const visualState = deriveVisualState(connectionState, instruction);
  const hasQueuedContext = contextDraft.trim().length > 0;

  // Auto-resize the textarea as the user types
  useAutoResize(instructionInputRef, instruction);

  return (
    <SurfaceCard className="panel panel-composer" data-composer-state={visualState}>
      <SectionHeader
        kicker="Control surface"
        title="Send an instruction"
        meta={
          <div className="composer-meta">
            <Badge tone={hasQueuedContext ? "accent" : "neutral"}>
              {hasQueuedContext ? "Context queued" : "No extra context"}
            </Badge>
            <Badge tone="accent">Cmd/Ctrl+Enter</Badge>
          </div>
        }
      />

      {/* Composer notice */}
      {composerNotice ? (
        <div className="composer-notice" data-tone={composerNotice.tone}>
          <div className="composer-notice-header">
            <StatusDot tone={composerNotice.tone} />
            <strong>{composerNotice.title}</strong>
          </div>
          <p>{composerNotice.detail}</p>
        </div>
      ) : null}

      {/* Instruction form */}
      <form className="instruction-form" onSubmit={onSubmitInstruction}>
        <label className="field-label" htmlFor="instruction">
          Instruction
        </label>
        <div className="composer-input-wrapper" data-state={visualState}>
          <textarea
            id="instruction"
            ref={instructionInputRef}
            className="instruction-input"
            value={instruction}
            onChange={(event) => handleTextareaChange(event, onInstructionChange)}
            onKeyDown={onInstructionKeyDown}
            aria-keyshortcuts="Control+Enter Meta+Enter"
            placeholder="Ask Shipyard to inspect a file, explain the current diff, or map the next change."
            rows={2}
          />
          {/* Inline context indicator */}
          {hasQueuedContext ? (
            <span className="composer-context-indicator" aria-label="Context queued">
              <ContextIcon />
            </span>
          ) : null}
        </div>
        <div className="composer-actions">
          <button
            type="submit"
            className="primary-action"
            disabled={connectionState === "agent-busy"}
          >
            {connectionState === "agent-busy" ? "Working..." : "Run instruction"}
          </button>
          <p className="support-copy">
            Submit with Cmd/Ctrl+Enter. Use Up/Down arrows to recall previous instructions.
          </p>
        </div>
      </form>
    </SurfaceCard>
  );
}

// ── Inline icon ────────────────────────────────

function ContextIcon() {
  return (
    <svg
      className="composer-context-icon"
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="2"
        y="2"
        width="10"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path d="M5 5h4M5 7h4M5 9h2" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
