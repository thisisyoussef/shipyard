import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  createBoardViewModel,
  resolveBoardScopeKey,
} from "./board-view-model.js";
import {
  getBoardSelectedStory,
  readBoardPreferences,
  setBoardSelectedStory,
  writeBoardPreferences,
} from "./board-preferences.js";
import { HostedAccessGate } from "./HostedAccessGate.js";
import { HumanFeedbackPage } from "./HumanFeedbackPage.js";
import {
  buildDashboardCatalog,
} from "./dashboard-catalog.js";
import { resolveDashboardSystemNotice } from "./dashboard-system-notice.js";
import {
  createDashboardHeroLaunch,
  createDashboardManualLaunch,
  matchesDashboardLaunchCompletion,
  type DashboardLaunchIntent,
} from "./dashboard-launch.js";
import {
  markDashboardProductOpened,
  readDashboardPreferences,
  setDashboardActiveTab,
  toggleDashboardProductStar,
  writeDashboardPreferences,
} from "./dashboard-preferences.js";
import {
  getPreferredEditorRoute,
  resolveAppRoute,
  selectEditorRouteState,
  type EditorRouteState,
} from "./app-route.js";
import type { Route } from "./router.js";
import { NavBar } from "./shell/NavBar.js";
import { TargetCreationDialog } from "./TargetCreationDialog.js";
import {
  extractBootstrapAccessToken,
  resolveUiPage,
  shouldCancelBusyInstructionOnSubmit,
  useWorkbenchController,
} from "./use-workbench-controller.js";
import { useRouter } from "./use-router.js";
import type { DashboardViewNotice } from "./views/DashboardView.js";
import {
  BoardView,
  DashboardView,
  EditorView,
} from "./views/index.js";
import { RoutePlaceholderView } from "./views/RoutePlaceholderView.js";

export {
  extractBootstrapAccessToken,
  resolveUiPage,
  shouldCancelBusyInstructionOnSubmit,
} from "./use-workbench-controller.js";

function getEditorIntentKey(
  routeState: EditorRouteState | null,
): string | null {
  if (!routeState || routeState.status !== "opening") {
    return null;
  }

  switch (routeState.intent.kind) {
    case "activate-project":
      return `activate:${routeState.intent.projectId}`;
    case "switch-target":
      return `switch:${routeState.intent.targetPath}`;
    case "none":
      return null;
  }
}

function isEditorRouteLoading(
  route: Route,
  routeState: EditorRouteState | null,
  hasLoadedWorkbenchState: boolean,
): boolean {
  return (
    route.view === "editor" &&
    routeState?.status === "missing" &&
    !hasLoadedWorkbenchState
  );
}

export function App() {
  const controller = useWorkbenchController();
  const { navigate } = useRouter();
  const requestedEditorIntentRef = useRef<string | null>(null);
  const shouldFollowCreatedTargetRef = useRef(false);
  const lastOpenedEditorProductRef = useRef<string | null>(null);
  const handledTargetSwitchCompletionRef = useRef<number | null>(null);
  const [boardPreferences, setBoardPreferences] = useState(() =>
    readBoardPreferences(),
  );
  const [dashboardPreferences, setDashboardPreferences] = useState(() =>
    readDashboardPreferences(),
  );
  const [dashboardHeroPrompt, setDashboardHeroPrompt] = useState("");
  const [dashboardNotice, setDashboardNotice] =
    useState<DashboardViewNotice | null>(null);
  const [dashboardCreateDialogOpen, setDashboardCreateDialogOpen] =
    useState(false);
  const [pendingDashboardLaunch, setPendingDashboardLaunch] =
    useState<DashboardLaunchIntent | null>(null);
  const appRoute = resolveAppRoute(
    typeof window === "undefined" ? "/" : window.location.pathname,
    typeof window === "undefined" ? "" : window.location.hash,
  );
  const preferredEditorRoute = getPreferredEditorRoute(
    controller.viewState.projectBoard,
    controller.viewState.targetManager,
  );
  const navEditorRoute =
    appRoute.view === "editor" ? appRoute : preferredEditorRoute;
  const editorRouteState = appRoute.view === "editor"
    ? selectEditorRouteState({
        productId: appRoute.productId,
        projectBoard: controller.viewState.projectBoard,
        targetManager: controller.viewState.targetManager,
      })
    : null;
  const hasLoadedWorkbenchState =
    controller.viewState.targetManager !== null ||
    controller.viewState.projectBoard !== null;
  const loadingEditorRoute = isEditorRouteLoading(
    appRoute,
    editorRouteState,
    hasLoadedWorkbenchState,
  );
  const boardScopeKey = resolveBoardScopeKey({
    sessionState: controller.viewState.sessionState,
    targetManager: controller.viewState.targetManager,
    projectBoard: controller.viewState.projectBoard,
  });
  const boardViewModel = createBoardViewModel({
    taskBoard: controller.viewState.taskBoard,
    connectionState: controller.viewState.connectionState,
    sessionState: controller.viewState.sessionState,
    targetManager: controller.viewState.targetManager,
    projectBoard: controller.viewState.projectBoard,
    selectedStoryId: boardScopeKey
      ? getBoardSelectedStory(boardPreferences, boardScopeKey)
      : "all",
  });
  const dashboardCatalog = buildDashboardCatalog({
    targetManager: controller.viewState.targetManager,
    projectBoard: controller.viewState.projectBoard,
    sessionState: controller.viewState.sessionState,
    preferences: dashboardPreferences,
  });
  const effectiveDashboardNotice =
    dashboardNotice ??
    (pendingDashboardLaunch === null
      ? resolveDashboardSystemNotice({
        connectionState: controller.viewState.connectionState,
        hasLoadedCatalog: hasLoadedWorkbenchState,
      })
      : null);

  useEffect(() => {
    const intentKey = getEditorIntentKey(editorRouteState);
    const nextEditorRouteState = editorRouteState;

    if (
      !controller.hasUnlockedAccess ||
      appRoute.view !== "editor" ||
      !nextEditorRouteState ||
      !intentKey ||
      loadingEditorRoute
    ) {
      requestedEditorIntentRef.current = null;
      return;
    }

    if (requestedEditorIntentRef.current === intentKey) {
      return;
    }

    requestedEditorIntentRef.current = intentKey;

    switch (nextEditorRouteState.intent.kind) {
      case "activate-project":
        controller.onActivateProject(nextEditorRouteState.intent.projectId);
        return;
      case "switch-target":
        controller.onRequestTargetSwitch(nextEditorRouteState.intent.targetPath);
        return;
      case "none":
        return;
    }
  }, [
    appRoute,
    controller,
    editorRouteState,
    loadingEditorRoute,
  ]);

  useEffect(() => {
    if (!shouldFollowCreatedTargetRef.current || appRoute.view !== "editor") {
      return;
    }

    if (!preferredEditorRoute) {
      return;
    }

    if (preferredEditorRoute.productId === appRoute.productId) {
      shouldFollowCreatedTargetRef.current = false;
      return;
    }

    shouldFollowCreatedTargetRef.current = false;
    navigate(preferredEditorRoute);
  }, [appRoute, navigate, preferredEditorRoute]);

  useEffect(() => {
    writeBoardPreferences(boardPreferences);
  }, [boardPreferences]);

  useEffect(() => {
    writeDashboardPreferences(dashboardPreferences);
  }, [dashboardPreferences]);

  useEffect(() => {
    if (appRoute.view !== "editor" || editorRouteState?.status !== "active") {
      lastOpenedEditorProductRef.current = null;
      return;
    }

    if (lastOpenedEditorProductRef.current === editorRouteState.productId) {
      return;
    }

    lastOpenedEditorProductRef.current = editorRouteState.productId;
    setDashboardPreferences((currentPreferences) =>
      markDashboardProductOpened(
        currentPreferences,
        editorRouteState.productId,
        new Date().toISOString(),
      )
    );
  }, [appRoute.view, editorRouteState]);

  useEffect(() => {
    const completion = controller.lastTargetSwitchCompletion;

    if (!completion) {
      return;
    }

    if (handledTargetSwitchCompletionRef.current === completion.sequence) {
      return;
    }

    handledTargetSwitchCompletionRef.current = completion.sequence;

    if (
      !pendingDashboardLaunch ||
      !matchesDashboardLaunchCompletion(pendingDashboardLaunch, completion)
    ) {
      return;
    }

    if (!completion.success) {
      setPendingDashboardLaunch(null);
      setDashboardNotice({
        tone: "danger",
        title: "Could not open the new product",
        detail:
          completion.message ??
          "Shipyard could not create the requested product right now.",
      });
      return;
    }

    setDashboardPreferences((currentPreferences) =>
      markDashboardProductOpened(
        currentPreferences,
        completion.state.currentTarget.path,
        completion.receivedAt,
      )
    );

    if (pendingDashboardLaunch.promptDraft) {
      controller.onInstructionChange(pendingDashboardLaunch.promptDraft);
    }

    setDashboardHeroPrompt("");
    setDashboardNotice(null);
    setDashboardCreateDialogOpen(false);
    setPendingDashboardLaunch(null);
    navigate({
      view: "editor",
      productId: completion.state.currentTarget.path,
    });
  }, [
    controller.lastTargetSwitchCompletion,
    controller.onInstructionChange,
    navigate,
    pendingDashboardLaunch,
  ]);

  function handleNavigateToEditor(targetPath: string): void {
    navigate({
      view: "editor",
      productId: targetPath,
    });
  }

  function handleActivateProject(projectId: string): void {
    const project = controller.viewState.projectBoard?.openProjects.find(
      (openProject) => openProject.projectId === projectId,
    );

    if (!project) {
      controller.onActivateProject(projectId);
      return;
    }

    handleNavigateToEditor(project.targetPath);
  }

  function handleTargetCreate(
    input: Parameters<typeof controller.onRequestTargetCreate>[0],
  ): void {
    shouldFollowCreatedTargetRef.current = true;
    controller.onRequestTargetCreate(input);
  }

  function handleDashboardHeroSubmit(prompt: string): void {
    const launchIntent = createDashboardHeroLaunch(prompt);
    const sent = controller.onRequestTargetCreate(
      {
        name: launchIntent.request.name,
        description: launchIntent.request.description,
        scaffoldType: launchIntent.request.scaffoldType,
      },
      {
        requestId: launchIntent.requestId,
      },
    );

    if (!sent) {
      setDashboardNotice({
        tone: "danger",
        title: "Launch unavailable",
        detail:
          "The browser runtime is disconnected. Reconnect before creating a product from the dashboard.",
      });
      return;
    }

    setPendingDashboardLaunch(launchIntent);
    setDashboardNotice({
      tone: "neutral",
      title: `Creating ${launchIntent.createdName}`,
      detail:
        "Shipyard is scaffolding the product and will carry your brief into the editor composer.",
    });
  }

  function handleDashboardManualCreate(input: {
    name: string;
    description: string;
    scaffoldType: "react-ts" | "express-ts" | "python" | "go" | "empty";
  }): void {
    const launchIntent = createDashboardManualLaunch(input);
    const sent = controller.onRequestTargetCreate(
      {
        name: launchIntent.request.name,
        description: launchIntent.request.description,
        scaffoldType: launchIntent.request.scaffoldType,
      },
      {
        requestId: launchIntent.requestId,
      },
    );

    if (!sent) {
      setDashboardNotice({
        tone: "danger",
        title: "Creation unavailable",
        detail:
          "The browser runtime is disconnected. Reconnect before scaffolding a new product.",
      });
      return;
    }

    setPendingDashboardLaunch(launchIntent);
    setDashboardCreateDialogOpen(false);
    setDashboardNotice({
      tone: "neutral",
      title: `Creating ${launchIntent.createdName}`,
      detail:
        "Shipyard will open the new product in the editor as soon as the scaffold is ready.",
    });
  }

  function handleBoardStoryChange(storyId: string): void {
    if (!boardViewModel.scopeKey) {
      return;
    }

    setBoardPreferences((currentPreferences) =>
      setBoardSelectedStory(
        currentPreferences,
        boardViewModel.scopeKey!,
        storyId,
      )
    );
  }

  function renderEditorContent(): ReactNode {
    if (loadingEditorRoute) {
      return (
        <RoutePlaceholderView
          kicker="Editor"
          title="Loading workspace"
          description="Shipyard is resolving the editor route against the live target state."
        />
      );
    }

    if (!editorRouteState) {
      return null;
    }

    if (editorRouteState.status === "opening") {
      return (
        <RoutePlaceholderView
          kicker="Editor"
          title={`Opening ${editorRouteState.productName ?? "workspace"}`}
          description="Shipyard is synchronizing the requested project with the live browser session."
          action={
            preferredEditorRoute ? (
              <button
                type="button"
                className="target-inline-action"
                onClick={() => navigate(preferredEditorRoute)}
              >
                Open active editor instead
              </button>
            ) : undefined
          }
        />
      );
    }

    if (editorRouteState.status === "missing") {
      return (
        <RoutePlaceholderView
          kicker="Editor"
          title="This product is not available"
          description="The requested product route does not match any open project or known target in the current Shipyard session."
          action={
            <button
              type="button"
              className="target-inline-action"
              onClick={() => navigate({ view: "dashboard" })}
            >
              Return to dashboard
            </button>
          }
        />
      );
    }

    return (
      <EditorView
        productId={editorRouteState.productId}
        productName={editorRouteState.productName ?? "Untitled target"}
        scaffoldType={
          controller.viewState.targetManager?.currentTarget.framework ?? ""
        }
        hostedEditorUrl={
          typeof window === "undefined" ? "" : window.location.origin
        }
        sessionState={controller.viewState.sessionState}
        sessionHistory={controller.viewState.sessionHistory}
        targetManager={controller.viewState.targetManager}
        projectBoard={controller.viewState.projectBoard}
        turns={controller.deferredTurns}
        fileEvents={controller.deferredFileEvents}
        previewState={controller.viewState.previewState}
        latestDeploy={controller.viewState.latestDeploy}
        contextHistory={controller.deferredContextHistory}
        pendingUploads={controller.viewState.pendingUploads}
        connectionState={controller.viewState.connectionState}
        agentStatus={controller.viewState.agentStatus}
        ultimateState={controller.viewState.ultimateState}
        instruction={controller.instruction}
        contextDraft={controller.contextDraft}
        composerBehavior={controller.composerBehavior}
        composerNotice={controller.composerNotice}
        composerAttachments={controller.composerAttachments}
        instructionInputRef={controller.instructionInputRef}
        contextInputRef={controller.contextInputRef}
        onInstructionChange={controller.onInstructionChange}
        onContextChange={controller.onContextChange}
        onInstructionKeyDown={controller.onInstructionKeyDown}
        onContextKeyDown={controller.onContextKeyDown}
        onClearContext={controller.onClearContext}
        onAttachFiles={controller.onAttachFiles}
        onToggleUltimateArmed={controller.onToggleUltimateArmed}
        onSubmitInstruction={controller.onSubmitInstruction}
        onCancelInstruction={controller.onCancelInstruction}
        onRemoveAttachment={controller.onRemoveAttachment}
        onRequestSessionResume={controller.onRequestSessionResume}
        onRequestTargetSwitch={handleNavigateToEditor}
        onRequestTargetCreate={handleTargetCreate}
        onActivateProject={handleActivateProject}
        onRefreshStatus={controller.onRefreshStatus}
        onCopyTracePath={controller.onCopyTracePath}
        traceButtonLabel={controller.traceButtonLabel}
        leftSidebarOpen={controller.leftSidebarOpen}
        rightSidebarOpen={controller.rightSidebarOpen}
        onToggleLeftSidebar={controller.onToggleLeftSidebar}
        onToggleRightSidebar={controller.onToggleRightSidebar}
        onNavigate={navigate}
      />
    );
  }

  if (!controller.hasUnlockedAccess) {
    return (
      <HostedAccessGate
        accessToken={controller.accessToken}
        checking={!controller.accessState.checked}
        submitting={controller.accessSubmitting}
        message={controller.accessState.message}
        onAccessTokenChange={controller.onAccessTokenChange}
        onSubmit={controller.onAccessSubmit}
      />
    );
  }

  if (appRoute.view === "human-feedback") {
    return (
      <HumanFeedbackPage
        sessionState={controller.viewState.sessionState}
        previewState={controller.viewState.previewState}
        turns={controller.deferredTurns}
        connectionState={controller.viewState.connectionState}
        agentStatus={controller.viewState.agentStatus}
        ultimateState={controller.viewState.ultimateState}
        instruction={controller.humanFeedbackInstruction}
        submitLabel={controller.humanFeedbackBehavior.submitLabel}
        submitDisabled={controller.humanFeedbackBehavior.submitDisabled}
        helpText={controller.humanFeedbackBehavior.helpText}
        textareaRef={controller.humanFeedbackInputRef}
        notice={controller.composerNotice}
        onInstructionChange={controller.onHumanFeedbackInstructionChange}
        onInstructionKeyDown={controller.onHumanFeedbackKeyDown}
        onSubmit={controller.onSubmitHumanFeedback}
        onRefreshStatus={controller.onRefreshStatus}
      />
    );
  }

  return (
    <div className="app-route-shell">
      <NavBar
        currentView={appRoute.view}
        editorRoute={navEditorRoute}
        boardDisabled={false}
        onNavigate={navigate}
        ultimateState={controller.viewState.ultimateState}
        ultimateDisabled={
          controller.viewState.ultimateState.phase === "idle" &&
          navEditorRoute === null
        }
        onUltimateClick={() => {
          if (navEditorRoute) {
            navigate(navEditorRoute);
          }
          controller.onActivateUltimate();
        }}
        onSendUltimateFeedback={controller.onSendUltimateFeedback}
        onStopUltimate={controller.onStopUltimateMode}
      />

      <main className="app-route-content">
        {appRoute.view === "dashboard" ? (
          <>
            <DashboardView
              heroPrompt={dashboardHeroPrompt}
              heroBusy={pendingDashboardLaunch !== null}
              activeTab={dashboardCatalog.activeTab}
              cards={dashboardCatalog.visibleCards}
              emptyState={dashboardCatalog.emptyState}
              notice={effectiveDashboardNotice}
              onHeroPromptChange={(value) => {
                setDashboardHeroPrompt(value);
                if (pendingDashboardLaunch === null && dashboardNotice) {
                  setDashboardNotice(null);
                }
              }}
              onSubmitHeroPrompt={handleDashboardHeroSubmit}
              onSelectTab={(tab) =>
                setDashboardPreferences((currentPreferences) =>
                  setDashboardActiveTab(currentPreferences, tab)
                )}
              onOpenProduct={(productId) => {
                setDashboardNotice(null);
                handleNavigateToEditor(productId);
              }}
              onToggleStar={(productId) =>
                setDashboardPreferences((currentPreferences) =>
                  toggleDashboardProductStar(currentPreferences, productId)
                )}
              onCreateProduct={() => {
                setDashboardNotice(null);
                setDashboardCreateDialogOpen(true);
              }}
            />
            <TargetCreationDialog
              open={dashboardCreateDialogOpen}
              onClose={() => setDashboardCreateDialogOpen(false)}
              onCreateTarget={handleDashboardManualCreate}
            />
          </>
        ) : null}

        {appRoute.view === "editor" ? renderEditorContent() : null}

        {appRoute.view === "board" ? (
          <BoardView
            board={boardViewModel}
            preferredEditorRoute={preferredEditorRoute}
            onNavigate={navigate}
            onSelectStory={handleBoardStoryChange}
          />
        ) : null}
      </main>
    </div>
  );
}
