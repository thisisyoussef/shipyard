/**
 * Shipyard Workbench — Split-pane composition.
 * Art Deco Command · Lovable-style architecture.
 *
 * Left: conversation (chat + composer at bottom)
 * Right: workspace (preview / files / live view — tabbed)
 */

import { useState } from "react";

import {
  FilePanel,
  OutputPanel,
} from "./panels/index.js";
import { TargetCreationDialog } from "./TargetCreationDialog.js";
import { TargetSwitcher } from "./TargetSwitcher.js";
import {
  HeaderStrip,
  ShellFooter,
  ShellSidebar,
  ShipyardShell,
} from "./shell/index.js";
import type { WorkbenchRuntimeProps } from "./workbench-surfaces.js";
import {
  WorkbenchConversationSurface,
  WorkbenchDrawerContent,
} from "./workbench-surfaces.js";

export interface ShipyardWorkbenchProps extends WorkbenchRuntimeProps {
  initialPrimaryView?: "chat" | "preview" | "live";
}

/* ── Icon components ──────────────────────── */

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
  const [drawerOpen, setDrawerOpen] = useState(false);

  const sessionViewKey = props.sessionState?.sessionId ?? "no-session";
  const workspaceName = props.sessionState?.workspaceDirectory?.split("/").pop();
  const activePhase = props.sessionState?.activePhase ?? "target-manager";
  const targetName =
    props.targetManager?.currentTarget.name ?? props.sessionState?.targetLabel;
  const targetPath =
    props.targetManager?.currentTarget.path ?? props.sessionState?.targetDirectory;

  const leftRailItems = [
    { id: "session", icon: <SessionIcon />, label: "Session", active: true },
    {
      id: "context",
      icon: <ContextIcon />,
      label: "Context",
      active: props.contextDraft.length > 0 || props.contextHistory.length > 0,
    },
  ];

  return (
    <>
      <ShipyardShell
        header={
          <HeaderStrip
            workspaceName={workspaceName}
            workspacePath={props.sessionState?.workspaceDirectory}
            targetName={targetName}
            targetPath={targetPath}
            connectionState={props.connectionState}
            leftSidebarOpen={drawerOpen}
            rightSidebarOpen={false}
            onCopyTracePath={props.onCopyTracePath}
            onRefresh={props.onRefreshStatus}
            onToggleLeftSidebar={() => setDrawerOpen((v) => !v)}
            onToggleRightSidebar={() => setDrawerOpen((v) => !v)}
            traceButtonLabel={props.traceButtonLabel}
          />
        }
        leftPanel={
          <WorkbenchConversationSurface
            sessionState={props.sessionState}
            targetManager={props.targetManager}
            projectBoard={props.projectBoard}
            turns={props.turns}
            latestDeploy={props.latestDeploy}
            connectionState={props.connectionState}
            ultimateState={props.ultimateState}
            instruction={props.instruction}
            composerBehavior={props.composerBehavior}
            composerNotice={props.composerNotice}
            composerAttachments={props.composerAttachments}
            instructionInputRef={props.instructionInputRef}
            onInstructionChange={props.onInstructionChange}
            onInstructionKeyDown={props.onInstructionKeyDown}
            onAttachFiles={props.onAttachFiles}
            onToggleUltimateArmed={props.onToggleUltimateArmed}
            onSubmitInstruction={props.onSubmitInstruction}
            onCancelInstruction={props.onCancelInstruction}
            onRemoveAttachment={props.onRemoveAttachment}
            onActivateProject={props.onActivateProject}
            onOpenTargets={() => setTargetSwitcherOpen(true)}
          />
        }
        rightPanel={
          <div className="workspace-pane">
            <div className="workspace-content">
              <FilePanel
                key={`files-${sessionViewKey}`}
                fileEvents={props.fileEvents}
              />
              <OutputPanel
                key={`output-${sessionViewKey}`}
                turns={props.turns}
              />
            </div>
          </div>
        }
        drawer={
          <WorkbenchDrawerContent
            sessionState={props.sessionState}
            sessionHistory={props.sessionHistory}
            contextHistory={props.contextHistory}
            contextDraft={props.contextDraft}
            contextInputRef={props.contextInputRef}
            onContextChange={props.onContextChange}
            onContextKeyDown={props.onContextKeyDown}
            onClearContext={props.onClearContext}
            onRequestSessionResume={props.onRequestSessionResume}
          />
        }
        drawerOpen={drawerOpen}
        onDrawerClose={() => setDrawerOpen(false)}
        // Legacy props for backward compat with tests
        leftSidebar={
          <ShellSidebar collapsed={!drawerOpen} railItems={leftRailItems}>
            <WorkbenchDrawerContent
              sessionState={props.sessionState}
              sessionHistory={props.sessionHistory}
              contextHistory={props.contextHistory}
              contextDraft={props.contextDraft}
              contextInputRef={props.contextInputRef}
              onContextChange={props.onContextChange}
              onContextKeyDown={props.onContextKeyDown}
              onClearContext={props.onClearContext}
              onRequestSessionResume={props.onRequestSessionResume}
            />
          </ShellSidebar>
        }
        rightSidebar={
          <ShellSidebar collapsed={true} railItems={[]}>
            <FilePanel
              key={`drawer-files-${sessionViewKey}`}
              fileEvents={props.fileEvents}
            />
            <OutputPanel
              key={`drawer-output-${sessionViewKey}`}
              turns={props.turns}
            />
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
        leftCollapsed={!drawerOpen}
        rightCollapsed={true}
      />

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
