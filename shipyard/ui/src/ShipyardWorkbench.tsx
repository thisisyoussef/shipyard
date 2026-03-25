/**
 * Shipyard Workbench — Root composition component.
 * UIV3: Full implementation using shell and panel components.
 */

import type { FormEvent, KeyboardEvent, RefObject } from "react";
import { useState } from "react";

import {
  ActivityFeed,
  ComposerPanel,
  ContextPanel,
  FilePanel,
  SessionPanel,
} from "./panels/index.js";
import type { BadgeTone } from "./primitives.js";
import {
  HeaderStrip,
  ShellFooter,
  ShellSidebar,
  ShipyardShell,
} from "./shell/index.js";
import type {
  ContextReceiptViewModel,
  FileEventViewModel,
  PreviewStateViewModel,
  SessionStateViewModel,
  TurnViewModel,
  WorkbenchConnectionState,
} from "./view-models.js";

/* ── Shared types ──────────────────────────── */

interface ComposerNotice {
  tone: BadgeTone;
  title: string;
  detail: string;
}

export interface ShipyardWorkbenchProps {
  sessionState: SessionStateViewModel | null;
  turns: TurnViewModel[];
  fileEvents: FileEventViewModel[];
  previewState: PreviewStateViewModel;
  contextHistory: ContextReceiptViewModel[];
  connectionState: WorkbenchConnectionState;
  agentStatus: string;
  instruction: string;
  contextDraft: string;
  composerNotice: ComposerNotice | null;
  instructionInputRef: RefObject<HTMLTextAreaElement | null>;
  contextInputRef: RefObject<HTMLTextAreaElement | null>;
  onInstructionChange: (value: string) => void;
  onContextChange: (value: string) => void;
  onInstructionKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onContextKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onClearContext: () => void;
  onSubmitInstruction: (event: FormEvent<HTMLFormElement>) => void;
  onRefreshStatus: () => void;
  onCopyTracePath: () => void;
  traceButtonLabel: string;
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;
  onToggleLeftSidebar: () => void;
  onToggleRightSidebar: () => void;
}

/* ── Icon components for sidebar rail ──────── */

function SessionIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
    </svg>
  );
}

function ContextIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  );
}

/* ── Main Component ──────────────────────────── */

export function ShipyardWorkbench(props: ShipyardWorkbenchProps) {
  const [leftCollapsed, setLeftCollapsed] = useState(!props.leftSidebarOpen);
  const [rightCollapsed, setRightCollapsed] = useState(!props.rightSidebarOpen);

  // Extract workspace/target names from paths
  const workspaceName = props.sessionState?.workspaceDirectory?.split("/").pop();
  const targetName = props.sessionState?.targetLabel;

  // Rail items for collapsed sidebar
  const leftRailItems = [
    {
      id: "session",
      icon: <SessionIcon />,
      label: "Session",
      active: true,
    },
    {
      id: "context",
      icon: <ContextIcon />,
      label: "Context",
      active: props.contextDraft.length > 0 || props.contextHistory.length > 0,
    },
  ];

  const handleLeftToggle = () => {
    const newState = !leftCollapsed;
    setLeftCollapsed(newState);
    props.onToggleLeftSidebar();
  };

  const handleRightToggle = () => {
    const newState = !rightCollapsed;
    setRightCollapsed(newState);
    props.onToggleRightSidebar();
  };

  return (
    <ShipyardShell
      leftCollapsed={leftCollapsed}
      rightCollapsed={rightCollapsed}
      onLeftCollapsedChange={setLeftCollapsed}
      onRightCollapsedChange={setRightCollapsed}
      header={
        <HeaderStrip
          workspaceName={workspaceName}
          workspacePath={props.sessionState?.workspaceDirectory}
          targetName={targetName}
          targetPath={props.sessionState?.targetDirectory}
          connectionState={props.connectionState}
          leftSidebarOpen={!leftCollapsed}
          rightSidebarOpen={!rightCollapsed}
          onCopyTracePath={props.onCopyTracePath}
          onRefresh={props.onRefreshStatus}
          onToggleLeftSidebar={handleLeftToggle}
          onToggleRightSidebar={handleRightToggle}
          traceButtonLabel={props.traceButtonLabel}
        />
      }
      leftSidebar={
        <ShellSidebar collapsed={leftCollapsed} railItems={leftRailItems}>
          <SessionPanel session={props.sessionState} />
          <ContextPanel
            history={props.contextHistory}
            draft={props.contextDraft}
            onDraftChange={props.onContextChange}
            onKeyDown={props.onContextKeyDown}
            onClear={props.onClearContext}
            textareaRef={props.contextInputRef}
          />
        </ShellSidebar>
      }
      rightSidebar={
        <ShellSidebar collapsed={rightCollapsed} railItems={[]}>
          <FilePanel fileEvents={props.fileEvents} />
        </ShellSidebar>
      }
      footer={
        <ShellFooter
          connectionState={props.connectionState}
          sessionId={props.sessionState?.sessionId}
          workspacePath={props.sessionState?.workspaceDirectory}
          agentStatus={props.agentStatus}
        />
      }
    >
      {/* Main content area */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", height: "100%" }}>
        {/* Composer at top */}
        <ComposerPanel
          instruction={props.instruction}
          onInstructionChange={props.onInstructionChange}
          onSubmit={props.onSubmitInstruction}
          onKeyDown={props.onInstructionKeyDown}
          textareaRef={props.instructionInputRef}
          agentBusy={props.connectionState === "agent-busy"}
          notice={props.composerNotice}
        />

        {/* Activity feed below */}
        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          <ActivityFeed turns={props.turns} />
        </div>
      </div>
    </ShipyardShell>
  );
}
