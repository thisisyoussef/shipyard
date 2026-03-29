import type { FormEvent, KeyboardEvent, ReactNode, RefObject } from "react";

import {
  ChatWorkspace,
  ComposerPanel,
  type ComposerAttachment,
  ContextPanel,
  RunHistoryPanel,
  SessionPanel,
} from "./panels/index.js";
import type { BadgeTone } from "./primitives.js";
import { ProjectBoard } from "./ProjectBoard.js";
import { TargetHeader } from "./TargetHeader.js";
import type { WorkbenchComposerBehavior } from "./ultimate-composer.js";
import type {
  ContextReceiptViewModel,
  FileEventViewModel,
  LatestDeployViewModel,
  PendingUploadReceiptViewModel,
  PreviewStateViewModel,
  ProjectBoardViewModel,
  SessionRunSummaryViewModel,
  SessionStateViewModel,
  TargetManagerViewModel,
  TurnViewModel,
  UltimateUiStateViewModel,
  WorkbenchConnectionState,
} from "./view-models.js";

export interface WorkbenchComposerNotice {
  tone: BadgeTone;
  title: string;
  detail: string;
}

export interface WorkbenchTargetCreationInput {
  name: string;
  description: string;
  initialInstruction?: string;
  scaffoldType: "react-ts" | "express-ts" | "python" | "go" | "empty";
}

export interface WorkbenchRuntimeProps {
  sessionState: SessionStateViewModel | null;
  sessionHistory: SessionRunSummaryViewModel[];
  targetManager: TargetManagerViewModel | null;
  projectBoard: ProjectBoardViewModel | null;
  turns: TurnViewModel[];
  fileEvents: FileEventViewModel[];
  previewState: PreviewStateViewModel;
  latestDeploy: LatestDeployViewModel;
  contextHistory: ContextReceiptViewModel[];
  pendingUploads: PendingUploadReceiptViewModel[];
  connectionState: WorkbenchConnectionState;
  agentStatus: string;
  ultimateState: UltimateUiStateViewModel;
  instruction: string;
  contextDraft: string;
  composerBehavior: WorkbenchComposerBehavior;
  composerNotice: WorkbenchComposerNotice | null;
  composerAttachments: ComposerAttachment[];
  instructionInputRef: RefObject<HTMLTextAreaElement | null>;
  contextInputRef: RefObject<HTMLTextAreaElement | null>;
  onInstructionChange: (value: string) => void;
  onContextChange: (value: string) => void;
  onInstructionKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onContextKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onClearContext: () => void;
  onAttachFiles: (files: File[]) => void;
  onToggleUltimateArmed: () => void;
  onSubmitInstruction: (event: FormEvent<HTMLFormElement>) => void;
  onCancelInstruction: () => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onRequestSessionResume: (sessionId: string) => void;
  onRequestTargetSwitch: (targetPath: string) => void;
  onRequestTargetCreate: (input: WorkbenchTargetCreationInput) => void;
  onActivateProject: (projectId: string) => void;
  onRefreshStatus: () => void;
  onCopyTracePath: () => void;
  traceButtonLabel: string;
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;
  onToggleLeftSidebar: () => void;
  onToggleRightSidebar: () => void;
}

export type WorkbenchConversationChrome = "full" | "chat-only";

interface WorkbenchConversationSurfaceProps
  extends Pick<
    WorkbenchRuntimeProps,
    | "sessionState"
    | "targetManager"
    | "projectBoard"
    | "turns"
    | "latestDeploy"
    | "connectionState"
    | "ultimateState"
    | "instruction"
    | "composerBehavior"
    | "composerNotice"
    | "composerAttachments"
    | "instructionInputRef"
    | "onInstructionChange"
    | "onInstructionKeyDown"
    | "onAttachFiles"
    | "onToggleUltimateArmed"
    | "onSubmitInstruction"
    | "onCancelInstruction"
    | "onRemoveAttachment"
    | "onActivateProject"
  > {
  onOpenTargets: () => void;
  chrome?: WorkbenchConversationChrome;
  emptyConversationContent?: ReactNode;
}

export function WorkbenchConversationSurface(
  props: WorkbenchConversationSurfaceProps,
) {
  const activePhase = props.sessionState?.activePhase ?? "target-manager";
  const chrome = props.chrome ?? "full";

  return (
    <div className="conversation-pane">
      {chrome === "full" ? (
        <ProjectBoard
          projectBoard={props.projectBoard}
          onActivateProject={props.onActivateProject}
          onOpenTargets={props.onOpenTargets}
        />
      ) : null}

      {chrome === "full" && props.targetManager ? (
        <TargetHeader
          activePhase={activePhase}
          targetManager={props.targetManager}
          latestDeploy={props.latestDeploy}
          onOpenSwitcher={props.onOpenTargets}
        />
      ) : null}

      <div className="conversation-scroll">
        <ChatWorkspace
          turns={props.turns}
          emptyContent={props.emptyConversationContent}
        />
      </div>

      <ComposerPanel
        instruction={props.instruction}
        onInstructionChange={props.onInstructionChange}
        onSubmit={props.onSubmitInstruction}
        onCancel={props.onCancelInstruction}
        onKeyDown={props.onInstructionKeyDown}
        textareaRef={props.instructionInputRef}
        agentBusy={props.connectionState === "agent-busy"}
        composerBehavior={props.composerBehavior}
        notice={props.composerNotice}
        attachments={props.composerAttachments}
        onAttachFiles={props.onAttachFiles}
        onUltimateToggle={props.onToggleUltimateArmed}
        onRemoveAttachment={props.onRemoveAttachment}
      />
    </div>
  );
}

interface WorkbenchDrawerContentProps
  extends Pick<
    WorkbenchRuntimeProps,
    | "sessionState"
    | "sessionHistory"
    | "contextHistory"
    | "contextDraft"
    | "contextInputRef"
    | "onContextChange"
    | "onContextKeyDown"
    | "onClearContext"
    | "onRequestSessionResume"
  > {}

export function WorkbenchDrawerContent(
  props: WorkbenchDrawerContentProps,
) {
  return (
    <div className="drawer-content">
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
    </div>
  );
}
