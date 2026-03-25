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
  UploadDeleteResponse,
  UploadErrorResponse,
  UploadReceiptsResponse,
} from "../../src/ui/contracts.js";
import {
  backendToFrontendMessageSchema,
  uploadDeleteResponseSchema,
  uploadErrorResponseSchema,
  uploadReceiptsResponseSchema,
} from "../../src/ui/contracts.js";
import { validateContextDraft } from "./context-ui.js";
import type { BadgeTone } from "./primitives.js";
import { ShipyardWorkbench } from "./ShipyardWorkbench.js";
import type { ComposerAttachment } from "./panels/ComposerPanel.js";
import { createSocketManager, type SocketManager } from "./socket-manager.js";
import {
  applyBackendMessage,
  appendPendingUploadReceipts,
  createInitialWorkbenchState,
  prepareInstructionSubmission,
  queueInstructionTurn,
  removePendingUploadReceipt,
  setTransportState,
  type UploadReceiptViewModel,
} from "./view-models.js";

interface ComposerNotice {
  tone: BadgeTone;
  title: string;
  detail: string;
}

function createAttachmentDetail(receipt: UploadReceiptViewModel): string {
  return `${receipt.storedRelativePath} · ${receipt.previewSummary}`;
}

function createUploadErrorMessage(
  payload: unknown,
  fallback: string,
): string {
  const parsed = uploadErrorResponseSchema.safeParse(payload);

  return parsed.success ? parsed.data.error : fallback;
}

function createSocketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
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
  const [instruction, setInstruction] = useState("");
  const [contextDraft, setContextDraft] = useState("");
  const [localUploads, setLocalUploads] = useState<ComposerAttachment[]>([]);
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
  const lastSessionIdRef = useRef<string | null>(null);
  const instructionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const contextInputRef = useRef<HTMLTextAreaElement | null>(null);
  const deferredTurns = useDeferredValue(viewState.turns);
  const deferredFileEvents = useDeferredValue(viewState.fileEvents);
  const deferredContextHistory = useDeferredValue(viewState.contextHistory);

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

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    const nextSessionId = viewState.sessionState?.sessionId ?? null;

    if (nextSessionId === lastSessionIdRef.current) {
      return;
    }

    lastSessionIdRef.current = nextSessionId;
    setLocalUploads([]);
  }, [viewState.sessionState?.sessionId]);

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

  async function handleAttachFiles(files: File[]): Promise<void> {
    const sessionId = viewState.sessionState?.sessionId;

    if (!sessionId) {
      queueComposerNotice({
        tone: "danger",
        title: "Uploads unavailable",
        detail:
          "Wait for the browser runtime to finish connecting before attaching files.",
      });
      return;
    }

    const uniqueFiles: File[] = [];
    const duplicateNames: string[] = [];
    const seenNames = new Set(
      [
        ...viewState.pendingUploads.map((receipt) => receipt.originalName),
        ...localUploads
          .filter((upload) => upload.status !== "rejected")
          .map((upload) => upload.label),
      ].map((name) => name.trim().toLowerCase()),
    );

    for (const file of files) {
      const normalizedName = file.name.trim().toLowerCase();

      if (seenNames.has(normalizedName)) {
        duplicateNames.push(file.name);
        continue;
      }

      seenNames.add(normalizedName);
      uniqueFiles.push(file);
    }

    if (duplicateNames.length > 0) {
      queueComposerNotice({
        tone: "danger",
        title: "Duplicate attachment",
        detail: `${duplicateNames.join(", ")} is already attached for this session.`,
      });
    }

    if (uniqueFiles.length === 0) {
      return;
    }

    const uploadingBadges: ComposerAttachment[] = uniqueFiles.map((file) => ({
      id: `upload-local-${globalThis.crypto.randomUUID()}`,
      label: file.name,
      detail: "Uploading to Shipyard...",
      status: "uploading",
    }));
    const uploadingIds = new Set(uploadingBadges.map((badge) => badge.id));

    setLocalUploads((currentUploads) => [
      ...uploadingBadges,
      ...currentUploads,
    ]);

    try {
      const uploadForm = new FormData();
      uploadForm.set("sessionId", sessionId);
      uniqueFiles.forEach((file) => {
        uploadForm.append("files", file);
      });

      const uploadResponse = await fetch("/api/uploads", {
        method: "POST",
        body: uploadForm,
        credentials: "same-origin",
      });
      const responseBody = await uploadResponse.json().catch(() => null);

      if (!uploadResponse.ok) {
        const errorMessage = createUploadErrorMessage(
          responseBody,
          "Upload failed before Shipyard accepted the files.",
        );

        setLocalUploads((currentUploads) =>
          currentUploads.map((upload) =>
            uploadingIds.has(upload.id)
              ? {
                  ...upload,
                  detail: `Upload failed: ${errorMessage}`,
                  status: "rejected",
                  error: errorMessage,
                }
              : upload
          ),
        );
        queueComposerNotice({
          tone: "danger",
          title: "Upload rejected",
          detail: errorMessage,
        });
        return;
      }

      const parsed = uploadReceiptsResponseSchema.safeParse(responseBody);

      if (!parsed.success) {
        throw new Error("Shipyard returned an invalid upload receipt payload.");
      }

      startTransition(() => {
        setViewState((currentState) =>
          appendPendingUploadReceipts(currentState, parsed.data.receipts),
        );
      });
      setLocalUploads((currentUploads) =>
        currentUploads.filter((upload) => !uploadingIds.has(upload.id))
      );
      queueComposerNotice({
        tone: "success",
        title: "Files attached",
        detail: `Attached ${String(parsed.data.receipts.length)} file${parsed.data.receipts.length === 1 ? "" : "s"} to the next turn.`,
      });
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : "Upload failed before Shipyard accepted the files.";

      setLocalUploads((currentUploads) =>
        currentUploads.map((upload) =>
          uploadingIds.has(upload.id)
            ? {
                ...upload,
                detail: `Upload failed: ${errorMessage}`,
                status: "rejected",
                error: errorMessage,
              }
            : upload
        ),
      );
      queueComposerNotice({
        tone: "danger",
        title: "Upload failed",
        detail: errorMessage,
      });
    }
  }

  async function handleRemoveAttachment(attachmentId: string): Promise<void> {
    const localAttachment = localUploads.find((upload) => upload.id === attachmentId);

    if (localAttachment) {
      setLocalUploads((currentUploads) =>
        currentUploads.filter((upload) => upload.id !== attachmentId)
      );
      return;
    }

    const sessionId = viewState.sessionState?.sessionId;

    if (!sessionId) {
      queueComposerNotice({
        tone: "danger",
        title: "Remove unavailable",
        detail:
          "Wait for the browser runtime to reconnect before removing an attached file.",
      });
      return;
    }

    try {
      const deleteResponse = await fetch(
        `/api/uploads/${encodeURIComponent(attachmentId)}?sessionId=${encodeURIComponent(sessionId)}`,
        {
          method: "DELETE",
          credentials: "same-origin",
        },
      );
      const responseBody = await deleteResponse.json().catch(() => null);

      if (!deleteResponse.ok) {
        queueComposerNotice({
          tone: "danger",
          title: "Remove failed",
          detail: createUploadErrorMessage(
            responseBody,
            "Shipyard could not remove the pending upload.",
          ),
        });
        return;
      }

      const parsed = uploadDeleteResponseSchema.safeParse(responseBody);

      if (!parsed.success) {
        throw new Error("Shipyard returned an invalid upload removal payload.");
      }

      startTransition(() => {
        setViewState((currentState) =>
          removePendingUploadReceipt(currentState, parsed.data.removedId),
        );
      });
      queueComposerNotice({
        tone: "neutral",
        title: "Attachment removed",
        detail:
          "Shipyard removed the pending upload from this session before the next turn.",
      });
    } catch (error) {
      queueComposerNotice({
        tone: "danger",
        title: "Remove failed",
        detail: error instanceof Error
          ? error.message
          : "Shipyard could not remove the pending upload.",
      });
    }
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

    const submission = prepareInstructionSubmission(
      instruction,
      contextDraft,
      viewState.pendingUploads,
    );

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
          submission.contextPreview,
        ),
      );
    });
    setInstruction("");
    setContextDraft(submission.clearedContextDraft);
    const attachedUploadCount = viewState.pendingUploads.length;
    const explicitContextCount = submission.injectedContext?.length ?? 0;
    queueComposerNotice(
      attachedUploadCount > 0 || explicitContextCount > 0
        ? {
            tone: "success",
            title: attachedUploadCount > 0 ? "Attachments queued" : "Context attached",
            detail: `Attached ${String(attachedUploadCount + explicitContextCount)} context item${(attachedUploadCount + explicitContextCount) === 1 ? "" : "s"} to the next turn.`,
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

  const composerAttachments: ComposerAttachment[] = [
    ...localUploads,
    ...viewState.pendingUploads.map((receipt) => ({
      id: receipt.id,
      label: receipt.originalName,
      detail: createAttachmentDetail(receipt),
      status: "attached" as const,
    })),
  ];

  return (
    <ShipyardWorkbench
      sessionState={viewState.sessionState}
      sessionHistory={viewState.sessionHistory}
      targetManager={viewState.targetManager}
      turns={deferredTurns}
      fileEvents={deferredFileEvents}
      previewState={viewState.previewState}
      contextHistory={deferredContextHistory}
      connectionState={viewState.connectionState}
      agentStatus={viewState.agentStatus}
      instruction={instruction}
      contextDraft={contextDraft}
      composerNotice={composerNotice}
      composerAttachments={composerAttachments}
      instructionInputRef={instructionInputRef}
      contextInputRef={contextInputRef}
      onInstructionChange={handleInstructionChange}
      onContextChange={handleContextChange}
      onInstructionKeyDown={handleComposerKeyDown}
      onContextKeyDown={handleComposerKeyDown}
      onClearContext={handleClearContext}
      onAttachFiles={handleAttachFiles}
      onSubmitInstruction={handleInstructionSubmit}
      onCancelInstruction={handleCancelInstruction}
      onRemoveAttachment={handleRemoveAttachment}
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
