import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import type { Route } from "../router.js";
import {
  createDefaultEditorLayoutPreference,
  getEditorPreference,
  MAX_EDITOR_SPLIT_RATIO,
  MIN_EDITOR_SPLIT_RATIO,
  readEditorPreferences,
  setEditorActiveTab,
  setEditorSplitRatio,
  writeEditorPreferences,
  type EditorLayoutPreference,
  type EditorWorkspaceTab,
} from "../editor-preferences.js";
import {
  CodeExplorerPanel,
  FilePanel,
  PreviewPanel,
} from "../panels/index.js";
import { TargetCreationDialog } from "../TargetCreationDialog.js";
import { TargetSwitcher } from "../TargetSwitcher.js";
import { HeaderStrip, ShellFooter } from "../shell/index.js";
import {
  WorkbenchConversationSurface,
  WorkbenchDrawerContent,
  type WorkbenchRuntimeProps,
} from "../workbench-surfaces.js";
import type { CodeBrowserClient } from "../code-browser-client.js";

export interface EditorViewProps extends WorkbenchRuntimeProps {
  productId: string;
  productName: string;
  scaffoldType: string;
  hostedEditorUrl: string;
  initialLayout?: EditorLayoutPreference;
  codeBrowserClient?: CodeBrowserClient;
  onNavigate: (route: Route) => void;
}

const TAB_ORDER: EditorWorkspaceTab[] = ["preview", "code", "files"];

function clampSplitRatio(splitRatio: number): number {
  return Math.min(
    Math.max(Math.round(splitRatio), MIN_EDITOR_SPLIT_RATIO),
    MAX_EDITOR_SPLIT_RATIO,
  );
}

function resolveInitialLayout(
  scopeKey: string,
  initialLayout?: EditorLayoutPreference,
): EditorLayoutPreference {
  if (initialLayout) {
    return {
      activeTab: initialLayout.activeTab,
      splitRatio: clampSplitRatio(initialLayout.splitRatio),
    };
  }

  if (!scopeKey) {
    return createDefaultEditorLayoutPreference();
  }

  return getEditorPreference(readEditorPreferences(), scopeKey);
}

function createTabLabel(tab: EditorWorkspaceTab): string {
  switch (tab) {
    case "preview":
      return "Preview";
    case "code":
      return "Code";
    case "files":
      return "Files";
  }
}

function createEmptyConversationContent(
  connectionState: EditorViewProps["connectionState"],
): ReactNode {
  switch (connectionState) {
    case "connecting":
      return (
        <p className="activity-empty-text">
          Connecting to the live Shipyard runtime…
        </p>
      );
    case "disconnected":
      return (
        <p className="activity-empty-text">
          The browser runtime is offline. Refresh the session to reconnect.
        </p>
      );
    case "error":
      return (
        <p className="activity-empty-text">
          The runtime needs attention before the next turn can begin.
        </p>
      );
    default:
      return (
        <p className="activity-empty-text">
          Submit an instruction to start a conversation with Shipyard.
        </p>
      );
  }
}

export function EditorView(props: EditorViewProps) {
  const activePhase = props.sessionState?.activePhase ?? "target-manager";
  const workspaceName = props.sessionState?.workspaceDirectory?.split("/").pop();
  const targetName =
    props.targetManager?.currentTarget.name ?? props.productName ?? props.sessionState?.targetLabel;
  const targetPath =
    props.targetManager?.currentTarget.path ?? props.sessionState?.targetDirectory ?? props.productId;
  const editorScopeKey = (
    props.sessionState?.targetDirectory ??
    props.productId
  ).trim();
  const shouldPersistLayout = props.initialLayout === undefined && Boolean(editorScopeKey);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const [targetSwitcherOpen, setTargetSwitcherOpen] = useState(false);
  const [targetCreationOpen, setTargetCreationOpen] = useState(false);
  const [dividerDragging, setDividerDragging] = useState(false);
  const [layout, setLayout] = useState(() =>
    resolveInitialLayout(editorScopeKey, props.initialLayout),
  );
  const activeTab = layout.activeTab;

  useEffect(() => {
    setLayout(resolveInitialLayout(editorScopeKey, props.initialLayout));
  }, [
    editorScopeKey,
    props.initialLayout?.activeTab,
    props.initialLayout?.splitRatio,
  ]);

  useEffect(() => {
    if (!shouldPersistLayout) {
      return;
    }

    let nextPreferences = readEditorPreferences();
    nextPreferences = setEditorActiveTab(
      nextPreferences,
      editorScopeKey,
      layout.activeTab,
    );
    nextPreferences = setEditorSplitRatio(
      nextPreferences,
      editorScopeKey,
      layout.splitRatio,
    );
    writeEditorPreferences(nextPreferences);
  }, [
    editorScopeKey,
    layout.activeTab,
    layout.splitRatio,
    shouldPersistLayout,
  ]);

  const setActiveTab = useCallback((tab: EditorWorkspaceTab) => {
    setLayout((currentLayout) =>
      currentLayout.activeTab === tab
        ? currentLayout
        : {
            ...currentLayout,
            activeTab: tab,
          }
    );
  }, []);

  const setSplitRatio = useCallback((splitRatio: number) => {
    const nextSplitRatio = clampSplitRatio(splitRatio);

    setLayout((currentLayout) =>
      currentLayout.splitRatio === nextSplitRatio
        ? currentLayout
        : {
            ...currentLayout,
            splitRatio: nextSplitRatio,
          }
    );
  }, []);

  const updateSplitRatioFromClientX = useCallback((clientX: number) => {
    const container = splitContainerRef.current;

    if (!container) {
      return;
    }

    const bounds = container.getBoundingClientRect();

    if (bounds.width <= 0) {
      return;
    }

    setSplitRatio(((clientX - bounds.left) / bounds.width) * 100);
  }, [setSplitRatio]);

  useEffect(() => {
    if (!dividerDragging) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      updateSplitRatioFromClientX(event.clientX);
    };
    const handleMouseUp = () => {
      setDividerDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dividerDragging, updateSplitRatioFromClientX]);

  const handleDividerMouseDown = useCallback((
    event: ReactMouseEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    setDividerDragging(true);
    updateSplitRatioFromClientX(event.clientX);
  }, [updateSplitRatioFromClientX]);

  const handleDividerKeyDown = useCallback((
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setSplitRatio(layout.splitRatio - 5);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      setSplitRatio(layout.splitRatio + 5);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setSplitRatio(MIN_EDITOR_SPLIT_RATIO);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setSplitRatio(MAX_EDITOR_SPLIT_RATIO);
    }
  }, [layout.splitRatio, setSplitRatio]);

  function renderWorkspace(): ReactNode {
    if (activeTab === "preview") {
      return (
        <PreviewPanel
          preview={props.previewState}
          deploy={props.latestDeploy}
          hostedEditorUrl={props.hostedEditorUrl}
        />
      );
    }

    if (activeTab === "code") {
      return (
        <CodeExplorerPanel
          projectId={editorScopeKey || null}
          codeBrowserClient={props.codeBrowserClient}
        />
      );
    }

    return <FilePanel fileEvents={props.fileEvents} />;
  }

  return (
    <>
      <div className="editor-view">
        <HeaderStrip
          workspaceName={workspaceName}
          workspacePath={props.sessionState?.workspaceDirectory}
          targetName={targetName}
          targetPath={targetPath}
          connectionState={props.connectionState}
          leftSidebarOpen={props.leftSidebarOpen}
          rightSidebarOpen={false}
          showRightToggle={false}
          onCopyTracePath={props.onCopyTracePath}
          onRefresh={props.onRefreshStatus}
          onToggleLeftSidebar={props.onToggleLeftSidebar}
          onToggleRightSidebar={props.onToggleRightSidebar}
          traceButtonLabel={props.traceButtonLabel}
        />

        <div ref={splitContainerRef} className="editor-split">
          <section
            className="editor-left"
            style={{ flexBasis: `${String(layout.splitRatio)}%` }}
            aria-label="Conversation"
          >
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
              emptyConversationContent={createEmptyConversationContent(
                props.connectionState,
              )}
            />
          </section>

          <div
            className="editor-divider"
            data-dragging={dividerDragging}
            role="separator"
            tabIndex={0}
            aria-label="Resize conversation and workspace"
            aria-orientation="vertical"
            aria-valuemin={MIN_EDITOR_SPLIT_RATIO}
            aria-valuemax={MAX_EDITOR_SPLIT_RATIO}
            aria-valuenow={layout.splitRatio}
            onMouseDown={handleDividerMouseDown}
            onKeyDown={handleDividerKeyDown}
          />

          <section className="editor-right" aria-label="Workspace">
            <div className="editor-workspace-tabs" role="tablist" aria-label="Workspace tabs">
              {TAB_ORDER.map((tab) => {
                const tabId = `editor-tab-${tab}`;
                const panelId = `editor-panel-${tab}`;
                const selected = activeTab === tab;

                return (
                  <button
                    key={tab}
                    id={tabId}
                    type="button"
                    className="editor-workspace-tab"
                    data-active={selected}
                    role="tab"
                    aria-selected={selected}
                    aria-controls={panelId}
                    onClick={() => setActiveTab(tab)}
                  >
                    {createTabLabel(tab)}
                  </button>
                );
              })}
            </div>

            <div
              id={`editor-panel-${activeTab}`}
              className="editor-workspace-content"
              role="tabpanel"
              aria-labelledby={`editor-tab-${activeTab}`}
            >
              {renderWorkspace()}
            </div>
          </section>
        </div>

        <div
          className="drawer-backdrop"
          data-visible={props.leftSidebarOpen}
          onClick={props.leftSidebarOpen ? props.onToggleLeftSidebar : undefined}
          aria-hidden="true"
        />
        <aside
          className="shell-drawer"
          data-open={props.leftSidebarOpen}
          role="complementary"
          aria-label="Session details"
        >
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
        </aside>

        <footer className="shell-footer" role="contentinfo">
          <ShellFooter
            connectionState={props.connectionState}
            sessionId={props.sessionState?.sessionId}
            workspacePath={props.sessionState?.workspaceDirectory}
            agentStatus={props.agentStatus}
          />
        </footer>
      </div>

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
