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
  RunHistoryPanel,
  SessionPanel,
} from "./panels/index.js";
import type { BadgeTone } from "./primitives.js";
import { TargetCreationDialog } from "./TargetCreationDialog.js";
import { TargetHeader } from "./TargetHeader.js";
import { TargetSwitcher } from "./TargetSwitcher.js";
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
  SessionRunSummaryViewModel,
  SessionStateViewModel,
  TargetManagerViewModel,
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
  sessionHistory: SessionRunSummaryViewModel[];
  targetManager: TargetManagerViewModel | null;
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
  onRequestSessionResume: (sessionId: string) => void;
  onRequestTargetSwitch: (targetPath: string) => void;
  onRequestTargetCreate: (input: {
    name: string;
    description: string;
    scaffoldType: "react-ts" | "express-ts" | "python" | "go" | "empty";
  }) => void;
  onRequestTargetEnrich: () => void;
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
  const [targetSwitcherOpen, setTargetSwitcherOpen] = useState(false);
  const [targetCreationOpen, setTargetCreationOpen] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(!props.leftSidebarOpen);
  const [rightCollapsed, setRightCollapsed] = useState(!props.rightSidebarOpen);

  const workspaceName = props.sessionState?.workspaceDirectory?.split("/").pop();
  const activePhase = props.sessionState?.activePhase ?? "target-manager";
  const targetName =
    props.targetManager?.currentTarget.name ?? props.sessionState?.targetLabel;
  const targetPath =
    props.targetManager?.currentTarget.path ?? props.sessionState?.targetDirectory;

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
    const nextState = !leftCollapsed;
    setLeftCollapsed(nextState);
    props.onToggleLeftSidebar();
  };

  const handleRightToggle = () => {
    const nextState = !rightCollapsed;
    setRightCollapsed(nextState);
    props.onToggleRightSidebar();
  };

  return (
    <>
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
            targetPath={targetPath}
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
            <RunHistoryPanel
              runs={props.sessionHistory}
              currentSessionId={props.sessionState?.sessionId ?? null}
              onResumeSession={props.onRequestSessionResume}
            />
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
        <div className="workbench-main-stack">
          {props.targetManager ? (
            <TargetHeader
              activePhase={activePhase}
              targetManager={props.targetManager}
              onOpenSwitcher={() => setTargetSwitcherOpen(true)}
              onRequestEnrichment={props.onRequestTargetEnrich}
            />
          ) : null}

          <ComposerPanel
            instruction={props.instruction}
            onInstructionChange={props.onInstructionChange}
            onSubmit={props.onSubmitInstruction}
            onKeyDown={props.onInstructionKeyDown}
            textareaRef={props.instructionInputRef}
            agentBusy={props.connectionState === "agent-busy"}
            notice={props.composerNotice}
          />

          <div className="workbench-main-activity">
            <ActivityFeed turns={props.turns} />
          </div>
        </div>
      </ShipyardShell>

      {props.targetManager ? (
        <TargetSwitcher
          activePhase={activePhase}
          open={targetSwitcherOpen}
          targetManager={props.targetManager}
          onClose={() => setTargetSwitcherOpen(false)}
          onCreateNew={() => {
            setTargetSwitcherOpen(false);
            setTargetCreationOpen(true);
          }}
          onSwitchTarget={(nextTargetPath) => {
            setTargetSwitcherOpen(false);
            props.onRequestTargetSwitch(nextTargetPath);
          }}
        />
      ) : null}

      <TargetCreationDialog
        open={targetCreationOpen}
        onClose={() => setTargetCreationOpen(false)}
        onCreateTarget={(input) => {
          setTargetCreationOpen(false);
          props.onRequestTargetCreate(input);
        }}
      />
    </>
  );
}
