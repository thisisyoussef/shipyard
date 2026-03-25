import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import type {
  BackendToFrontendMessage,
  FrontendToBackendMessage,
} from "../../src/ui/contracts.js";
import {
  backendToFrontendMessageSchema,
  uploadDeleteResponseSchema,
  uploadResponseSchema,
} from "../../src/ui/contracts.js";
import { validateContextDraft } from "./context-ui.js";
import { HostedAccessGate } from "./HostedAccessGate.js";
import type { BadgeTone } from "./primitives.js";
import { ShipyardWorkbench } from "./ShipyardWorkbench.js";
import { createSocketManager, type SocketManager } from "./socket-manager.js";
import {
  applyBackendMessage,
  createInitialWorkbenchState,
  prepareInstructionSubmission,
  queueInstructionTurn,
  setTransportState,
} from "./view-models.js";

interface ComposerNotice {
  tone: BadgeTone;
  title: string;
  detail: string;
}

interface HostedAccessResponse {
  required: boolean;
  authenticated: boolean;
  message?: string | null;
}

interface HostedAccessState {
  checked: boolean;
  required: boolean;
  authenticated: boolean;
  message: string | null;
}

function createSocketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

function isHostedAccessResponse(value: unknown): value is HostedAccessResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "required" in value &&
    typeof value.required === "boolean" &&
    "authenticated" in value &&
    typeof value.authenticated === "boolean" &&
    (!("message" in value) ||
      value.message === null ||
      typeof value.message === "string")
  );
}

function extractApiMessage(payload: unknown): string | null {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }

  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }

  return null;
}

async function parseHostedAccessResponse(
  response: Response,
): Promise<HostedAccessResponse> {
  const payload = await response.json().catch(() => null);

  if (!isHostedAccessResponse(payload)) {
    throw new Error("Shipyard returned an invalid hosted-access response.");
  }

  return payload;
}

export function extractBootstrapAccessToken(locationUrl: URL): {
  token: string | null;
  sanitizedRelativeUrl: string;
} {
  const searchParams = new URLSearchParams(locationUrl.search);
  const rawToken = searchParams.get("access_token")?.trim() ?? "";

  if (rawToken) {
    searchParams.delete("access_token");
  }

  const nextSearch = searchParams.toString();

  return {
    token: rawToken || null,
    sanitizedRelativeUrl:
      `${locationUrl.pathname}${nextSearch ? `?${nextSearch}` : ""}${locationUrl.hash}` ||
      "/",
  };
}

export function createHostedEditorUrl(locationUrl: URL): string {
  const bootstrapAccess = extractBootstrapAccessToken(locationUrl);

  return `${locationUrl.origin}${bootstrapAccess.sanitizedRelativeUrl}`;
}

function readSidebarState(key: string, fallback: boolean): boolean {
  try {
    const stored = localStorage.getItem(key);
    if (stored === "false") return false;
    if (stored === "true") return true;
  } catch {
    /* localStorage unavailable */
  }
  return fallback;
}

function writeSidebarState(key: string, open: boolean): void {
  try {
    localStorage.setItem(key, String(open));
  } catch {
    /* localStorage unavailable */
  }
}

export function App() {
  const [viewState, setViewState] = useState(createInitialWorkbenchState);
  const [accessState, setAccessState] = useState<HostedAccessState>({
    checked: false,
    required: false,
    authenticated: false,
    message: null,
  });
  const [accessToken, setAccessToken] = useState("");
  const [accessSubmitting, setAccessSubmitting] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [contextDraft, setContextDraft] = useState("");
  const [composerNotice, setComposerNotice] = useState<ComposerNotice | null>(
    null,
  );
  const [traceButtonLabel, setTraceButtonLabel] = useState("Copy trace path");
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(() =>
    readSidebarState("shipyard:sidebar-left", true),
  );
  const [rightSidebarOpen, setRightSidebarOpen] = useState(() =>
    readSidebarState("shipyard:sidebar-right", true),
  );
  const socketManagerRef = useRef<SocketManager | null>(null);
  const hasSessionRef = useRef(false);
  const instructionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const contextInputRef = useRef<HTMLTextAreaElement | null>(null);
  const deferredTurns = useDeferredValue(viewState.turns);
  const deferredFileEvents = useDeferredValue(viewState.fileEvents);
  const deferredContextHistory = useDeferredValue(viewState.contextHistory);
  const hasUnlockedAccess =
    accessState.checked &&
    (!accessState.required || accessState.authenticated);

  /* ── Sidebar toggles ──────────────────────── */

  const toggleLeftSidebar = useCallback(() => {
    setLeftSidebarOpen((prev) => {
      const next = !prev;
      writeSidebarState("shipyard:sidebar-left", next);
      return next;
    });
  }, []);

  const toggleRightSidebar = useCallback(() => {
    setRightSidebarOpen((prev) => {
      const next = !prev;
      writeSidebarState("shipyard:sidebar-right", next);
      return next;
    });
  }, []);

  /* ── Global keyboard shortcuts ────────────── */

  useEffect(() => {
    function handleGlobalKeyDown(event: globalThis.KeyboardEvent): void {
      const target = event.target as HTMLElement;
      const isInput =
        target.tagName === "TEXTAREA" ||
        target.tagName === "INPUT" ||
        target.isContentEditable;

      // Cmd/Ctrl+K — focus composer (works even in inputs)
      if (event.key === "k" && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
        event.preventDefault();
        instructionInputRef.current?.focus();
        return;
      }

      // Don't fire sidebar shortcuts when typing
      if (isInput) return;

      // Cmd/Ctrl+B — toggle left sidebar
      if (event.key === "b" && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
        event.preventDefault();
        toggleLeftSidebar();
        return;
      }

      // Cmd/Ctrl+Shift+B — toggle right sidebar
      if (event.key === "b" && (event.metaKey || event.ctrlKey) && event.shiftKey) {
        event.preventDefault();
        toggleRightSidebar();
      }
    }

    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [toggleLeftSidebar, toggleRightSidebar]);

  /* ── WebSocket ────────────────────────────── */

  const applyMessage = useEffectEvent((message: BackendToFrontendMessage) => {
    if (message.type === "session:state") {
      hasSessionRef.current = true;
    }

    startTransition(() => {
      setViewState((currentState) => applyBackendMessage(currentState, message));
    });
  });

  const applyTransportState = useEffectEvent(
    (connectionState: Parameters<typeof setTransportState>[1], status: string) => {
      startTransition(() => {
        setViewState((currentState) =>
          setTransportState(currentState, connectionState, status),
        );
      });
    },
  );

  const applyHostedAccessState = useEffectEvent(
    (nextState: HostedAccessResponse) => {
      setAccessState({
        checked: true,
        required: nextState.required,
        authenticated: nextState.authenticated,
        message: nextState.message ?? null,
      });
    },
  );

  const fetchHostedAccessState = useEffectEvent(async () => {
    const response = await fetch("/api/access", {
      headers: {
        accept: "application/json",
      },
    });

    return await parseHostedAccessResponse(response);
  });

  const submitHostedAccessToken = useEffectEvent(async (token: string) => {
    const response = await fetch("/api/access", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ token }),
    });

    return await parseHostedAccessResponse(response);
  });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const bootstrapAccess = extractBootstrapAccessToken(
        new URL(window.location.href),
      );

      if (bootstrapAccess.token) {
        window.history.replaceState({}, document.title, bootstrapAccess.sanitizedRelativeUrl);
      }

      try {
        const nextAccessState = bootstrapAccess.token
          ? await submitHostedAccessToken(bootstrapAccess.token)
          : await fetchHostedAccessState();

        if (cancelled) {
          return;
        }

        applyHostedAccessState(nextAccessState);
      } catch {
        if (cancelled) {
          return;
        }

        setAccessState({
          checked: true,
          required: true,
          authenticated: false,
          message:
            "Unable to verify hosted access right now. Refresh the page and try again.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasUnlockedAccess) {
      return;
    }

    const socketManager = createSocketManager({
      url: createSocketUrl(),
      hasSessionState: () => hasSessionRef.current,
      onOpen(socket) {
        const statusMessage: FrontendToBackendMessage = { type: "status" };
        socket.send(JSON.stringify(statusMessage));
      },
      onMessage(rawData) {
        let rawMessage: unknown;

        try {
          rawMessage = JSON.parse(rawData);
        } catch {
          applyTransportState("error", "Shipyard sent malformed JSON.");
          return;
        }

        const parsed = backendToFrontendMessageSchema.safeParse(rawMessage);

        if (!parsed.success) {
          applyTransportState("error", "Shipyard sent an unrecognized event.");
          return;
        }

        applyMessage(parsed.data);
      },
      onTransportState: applyTransportState,
    });
    socketManagerRef.current = socketManager;
    socketManager.start();

    return () => {
      socketManager.stop();

      if (socketManagerRef.current === socketManager) {
        socketManagerRef.current = null;
      }
    };
  }, [hasUnlockedAccess]);

  /* ── Messaging ────────────────────────────── */

  function sendMessage(message: FrontendToBackendMessage): boolean {
    return socketManagerRef.current?.send(JSON.stringify(message)) ?? false;
  }

  function queueComposerNotice(notice: ComposerNotice): void {
    setComposerNotice(notice);
  }

  function focusInstructionInput(): void {
    window.requestAnimationFrame(() => {
      instructionInputRef.current?.focus();
    });
  }

  function handleCancelInstruction(): void {
    const sent = sendMessage({
      type: "cancel",
    });

    if (!sent) {
      queueComposerNotice({
        tone: "danger",
        title: "Cancel unavailable",
        detail:
          "The browser runtime is disconnected. Reconnect before interrupting the current turn.",
      });
      return;
    }

    queueComposerNotice({
      tone: "neutral",
      title: "Stopping current turn",
      detail:
        "Shipyard is interrupting the active turn. Your draft stays in place so you can send it as soon as the session is ready.",
    });
    focusInstructionInput();
  }

  function submitInstruction(): void {
    if (viewState.connectionState === "agent-busy") {
      handleCancelInstruction();
      return;
    }

    const contextValidationError = validateContextDraft(contextDraft);

    if (contextValidationError) {
      queueComposerNotice({
        tone: "danger",
        title: "Context needs attention",
        detail: contextValidationError,
      });
      contextInputRef.current?.focus();
      return;
    }

    const submission = prepareInstructionSubmission(instruction, contextDraft);

    if (submission === null) {
      queueComposerNotice({
        tone: "danger",
        title: "Instruction required",
        detail: "Enter an instruction before running Shipyard.",
      });
      instructionInputRef.current?.focus();
      return;
    }

    const sent = sendMessage({
      type: "instruction",
      text: submission.instruction,
      injectedContext: submission.injectedContext,
    });

    if (!sent) {
      queueComposerNotice({
        tone: "danger",
        title: "Browser runtime disconnected",
        detail:
          "Wait for reconnect or refresh the session before submitting another turn.",
      });
      return;
    }

    startTransition(() => {
      setViewState((currentState) =>
        queueInstructionTurn(
          currentState,
          submission.instruction,
          submission.injectedContext ?? [],
        ),
      );
    });
    setInstruction("");
    setContextDraft(submission.clearedContextDraft);
    queueComposerNotice(
      submission.injectedContext?.length
        ? {
            tone: "success",
            title: "Context attached",
            detail: `Attached ${String(submission.injectedContext.length)} context note to the next turn.`,
          }
        : {
            tone: "accent",
            title: "Instruction queued",
            detail:
              "Shipyard accepted the next turn and will keep streaming activity below.",
          },
    );
    focusInstructionInput();
  }

  function handleInstructionSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    submitInstruction();
  }

  function handleComposerKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
  ): void {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submitInstruction();
      return;
    }

    if (
      event.key === "Escape" &&
      event.currentTarget.id === "context-draft" &&
      contextDraft.trim().length > 0
    ) {
      event.preventDefault();
      setContextDraft("");
      queueComposerNotice({
        tone: "neutral",
        title: "Context cleared",
        detail:
          "The next turn will run without extra injected context unless you add a new note.",
      });
      focusInstructionInput();
    }
  }

  function handleInstructionChange(value: string): void {
    setInstruction(value);
    if (composerNotice) setComposerNotice(null);
  }

  function handleAccessTokenChange(value: string): void {
    setAccessToken(value);

    if (accessState.message) {
      setAccessState((currentState) => ({
        ...currentState,
        message: null,
      }));
    }
  }

  function handleContextChange(value: string): void {
    setContextDraft(value);
    if (composerNotice) setComposerNotice(null);
  }

  function handleClearContext(): void {
    setContextDraft("");
    queueComposerNotice({
      tone: "neutral",
      title: "Context cleared",
      detail:
        "The next turn will run without extra injected context unless you add a new note.",
    });
    focusInstructionInput();
  }

  function handleCopyTracePath(): void {
    const tracePath = viewState.sessionState?.tracePath;

    if (!tracePath) return;

    if (!("clipboard" in navigator)) {
      setTraceButtonLabel("Trace unavailable");
      return;
    }

    void navigator.clipboard.writeText(tracePath).then(() => {
      setTraceButtonLabel("Trace path copied");
      window.setTimeout(() => {
        setTraceButtonLabel("Copy trace path");
      }, 1_200);
    });
  }

  function handleTargetSwitch(targetPath: string): void {
    const sent = sendMessage({
      type: "target:switch_request",
      targetPath,
    });

    if (!sent) {
      queueComposerNotice({
        tone: "danger",
        title: "Target switch unavailable",
        detail:
          "The browser runtime is disconnected. Reconnect before switching targets.",
      });
    }
  }

  function handleSessionResume(sessionId: string): void {
    const sent = sendMessage({
      type: "session:resume_request",
      sessionId,
    });

    if (!sent) {
      queueComposerNotice({
        tone: "danger",
        title: "Saved run unavailable",
        detail:
          "The browser runtime is disconnected. Reconnect before opening a saved run.",
      });
      return;
    }

    queueComposerNotice({
      tone: "neutral",
      title: "Opening saved run",
      detail:
        "Shipyard is loading the selected session history and switching the browser to that run.",
    });
  }

  function handleTargetCreate(input: {
    name: string;
    description: string;
    scaffoldType: "react-ts" | "express-ts" | "python" | "go" | "empty";
  }): void {
    const sent = sendMessage({
      type: "target:create_request",
      name: input.name,
      description: input.description,
      scaffoldType: input.scaffoldType,
    });

    if (!sent) {
      queueComposerNotice({
        tone: "danger",
        title: "Target creation unavailable",
        detail:
          "The browser runtime is disconnected. Reconnect before creating a target.",
      });
    }
  }

  function handleDeployTarget(): void {
    const sent = sendMessage({
      type: "deploy:request",
      platform: "vercel",
    });

    if (!sent) {
      queueComposerNotice({
        tone: "danger",
        title: "Deploy unavailable",
        detail:
          "The browser runtime is disconnected. Reconnect before deploying this target.",
      });
    }
  }

  async function handleUploadFiles(files: File[]): Promise<void> {
    const sessionId = viewState.sessionState?.sessionId;

    if (!sessionId) {
      queueComposerNotice({
        tone: "danger",
        title: "Upload unavailable",
        detail: "Wait for Shipyard to finish syncing the current session before attaching files.",
      });
      return;
    }

    const formData = new FormData();
    formData.set("sessionId", sessionId);

    for (const file of files) {
      formData.append("files", file);
    }

    try {
      const response = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        queueComposerNotice({
          tone: "danger",
          title: "Upload failed",
          detail:
            extractApiMessage(payload) ??
            "Shipyard could not store the selected files.",
        });
        return;
      }

      const parsed = uploadResponseSchema.safeParse(payload);

      if (!parsed.success) {
        queueComposerNotice({
          tone: "danger",
          title: "Upload failed",
          detail: "Shipyard returned an invalid upload receipt payload.",
        });
        return;
      }

      const readyUploads = parsed.data.receipts.filter(
        (receipt) => receipt.status === "ready",
      );
      const rejectedUploads = parsed.data.receipts.filter(
        (receipt) => receipt.status === "rejected",
      );

      if (readyUploads.length > 0 && rejectedUploads.length === 0) {
        queueComposerNotice({
          tone: "success",
          title: "Files attached",
          detail: `Shipyard stored ${String(readyUploads.length)} file${readyUploads.length === 1 ? "" : "s"} and will inject them into the next turn.`,
        });
        return;
      }

      if (readyUploads.length > 0) {
        queueComposerNotice({
          tone: "warning",
          title: "Some files attached",
          detail:
            rejectedUploads[0]?.errorMessage ??
            `Shipyard attached ${String(readyUploads.length)} file${readyUploads.length === 1 ? "" : "s"} and rejected ${String(rejectedUploads.length)} unsupported upload${rejectedUploads.length === 1 ? "" : "s"}.`,
        });
        return;
      }

      queueComposerNotice({
        tone: "danger",
        title: "Upload rejected",
        detail:
          rejectedUploads[0]?.errorMessage ??
          "Shipyard only supports bounded text-based uploads in this first hosted pass.",
      });
    } catch {
      queueComposerNotice({
        tone: "danger",
        title: "Upload failed",
        detail: "Shipyard could not reach the upload endpoint. Try again in a moment.",
      });
    }
  }

  async function handleRemovePendingUpload(receiptId: string): Promise<void> {
    const sessionId = viewState.sessionState?.sessionId;

    if (!sessionId) {
      return;
    }

    try {
      const response = await fetch(
        `/api/uploads/${encodeURIComponent(receiptId)}?sessionId=${encodeURIComponent(sessionId)}`,
        {
          method: "DELETE",
          headers: {
            accept: "application/json",
          },
        },
      );
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        queueComposerNotice({
          tone: "danger",
          title: "Remove failed",
          detail:
            extractApiMessage(payload) ??
            "Shipyard could not remove that pending upload.",
        });
        return;
      }

      const parsed = uploadDeleteResponseSchema.safeParse(payload);

      if (!parsed.success) {
        queueComposerNotice({
          tone: "danger",
          title: "Remove failed",
          detail: "Shipyard returned an invalid upload-removal payload.",
        });
        return;
      }

      queueComposerNotice({
        tone: "neutral",
        title: "Attachment removed",
        detail: "Shipyard will ignore that uploaded file on the next turn.",
      });
    } catch {
      queueComposerNotice({
        tone: "danger",
        title: "Remove failed",
        detail: "Shipyard could not reach the upload endpoint. Try again in a moment.",
      });
    }
  }

  async function handleHostedAccessSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    const normalizedToken = accessToken.trim();

    if (!normalizedToken) {
      setAccessState({
        checked: true,
        required: true,
        authenticated: false,
        message: "Enter the shared access token to continue.",
      });
      return;
    }

    setAccessSubmitting(true);

    try {
      const nextAccessState = await submitHostedAccessToken(normalizedToken);
      applyHostedAccessState(nextAccessState);

      if (nextAccessState.authenticated) {
        hasSessionRef.current = false;
        setAccessToken("");
      }
    } catch {
      setAccessState({
        checked: true,
        required: true,
        authenticated: false,
        message:
          "Unable to verify hosted access right now. Refresh the page and try again.",
      });
    } finally {
      setAccessSubmitting(false);
    }
  }

  if (!hasUnlockedAccess) {
    return (
      <HostedAccessGate
        accessToken={accessToken}
        checking={!accessState.checked}
        submitting={accessSubmitting}
        message={accessState.message}
        onAccessTokenChange={handleAccessTokenChange}
        onSubmit={handleHostedAccessSubmit}
      />
    );
  }

  const hostedEditorUrl = createHostedEditorUrl(new URL(window.location.href));

  return (
    <ShipyardWorkbench
      sessionState={viewState.sessionState}
      sessionHistory={viewState.sessionHistory}
      targetManager={viewState.targetManager}
      turns={deferredTurns}
      fileEvents={deferredFileEvents}
      previewState={viewState.previewState}
      latestDeploy={viewState.latestDeploy}
      hostedEditorUrl={hostedEditorUrl}
      contextHistory={deferredContextHistory}
      pendingUploads={viewState.pendingUploads}
      connectionState={viewState.connectionState}
      agentStatus={viewState.agentStatus}
      instruction={instruction}
      contextDraft={contextDraft}
      composerNotice={composerNotice}
      instructionInputRef={instructionInputRef}
      contextInputRef={contextInputRef}
      onInstructionChange={handleInstructionChange}
      onContextChange={handleContextChange}
      onInstructionKeyDown={handleComposerKeyDown}
      onContextKeyDown={handleComposerKeyDown}
      onClearContext={handleClearContext}
      onSubmitInstruction={handleInstructionSubmit}
      onCancelInstruction={handleCancelInstruction}
      onUploadFiles={handleUploadFiles}
      onRemovePendingUpload={handleRemovePendingUpload}
      onRequestDeploy={handleDeployTarget}
      onRequestSessionResume={handleSessionResume}
      onRequestTargetSwitch={handleTargetSwitch}
      onRequestTargetCreate={handleTargetCreate}
      onRefreshStatus={() => sendMessage({ type: "status" })}
      onCopyTracePath={handleCopyTracePath}
      traceButtonLabel={traceButtonLabel}
      leftSidebarOpen={leftSidebarOpen}
      rightSidebarOpen={rightSidebarOpen}
      onToggleLeftSidebar={toggleLeftSidebar}
      onToggleRightSidebar={toggleRightSidebar}
    />
  );
}
