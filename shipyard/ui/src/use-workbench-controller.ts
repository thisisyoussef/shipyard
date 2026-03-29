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
  uploadErrorResponseSchema,
  uploadReceiptsResponseSchema,
} from "../../src/ui/contracts.js";
import { validateContextDraft } from "./context-ui.js";
import type { BadgeTone } from "./primitives.js";
import type { ComposerAttachment } from "./panels/ComposerPanel.js";
import { createSocketManager, type SocketManager } from "./socket-manager.js";
import {
  resolveHumanFeedbackBehavior,
  resolveWorkbenchComposerBehavior,
} from "./ultimate-composer.js";
import {
  appendPendingUploadReceipts,
  applyBackendMessage,
  createInitialWorkbenchState,
  prepareInstructionSubmission,
  queueInstructionTurn,
  removePendingUploadReceipt,
  setTransportState,
  type UploadReceiptViewModel,
  type WorkbenchConnectionState,
} from "./view-models.js";

export interface ComposerNotice {
  tone: BadgeTone;
  title: string;
  detail: string;
}

interface HostedAccessResponse {
  required: boolean;
  authenticated: boolean;
  message?: string | null;
}

export interface HostedAccessState {
  checked: boolean;
  required: boolean;
  authenticated: boolean;
  message: string | null;
}

export interface TargetSwitchCompletionViewModel
  extends Extract<BackendToFrontendMessage, { type: "target:switch_complete" }> {
  receivedAt: string;
  sequence: number;
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

export type UiPage = "workbench" | "human-feedback";

export function resolveUiPage(pathname: string): UiPage {
  const normalizedPath = pathname.trim().replace(/\/+$/, "") || "/";

  if (normalizedPath === "/human-feedback") {
    return "human-feedback";
  }

  return "workbench";
}

export function shouldCancelBusyInstructionOnSubmit(
  page: UiPage,
  connectionState: WorkbenchConnectionState,
  ultimateActive = false,
): boolean {
  return (
    page !== "human-feedback" &&
    connectionState === "agent-busy" &&
    !ultimateActive
  );
}

export function useWorkbenchController() {
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
  const [humanFeedbackInstruction, setHumanFeedbackInstruction] = useState("");
  const [contextDraft, setContextDraft] = useState("");
  const [localUploads, setLocalUploads] = useState<ComposerAttachment[]>([]);
  const [composerNotice, setComposerNotice] = useState<ComposerNotice | null>(
    null,
  );
  const [traceButtonLabel, setTraceButtonLabel] = useState("Copy trace path");
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(() =>
    readSidebarState("shipyard:sidebar-left", false),
  );
  const [rightSidebarOpen, setRightSidebarOpen] = useState(() =>
    readSidebarState("shipyard:sidebar-right", true),
  );
  const [ultimateArmed, setUltimateArmed] = useState(false);
  const [
    lastTargetSwitchCompletion,
    setLastTargetSwitchCompletion,
  ] = useState<TargetSwitchCompletionViewModel | null>(null);
  const socketManagerRef = useRef<SocketManager | null>(null);
  const hasSessionRef = useRef(false);
  const lastSessionIdRef = useRef<string | null>(null);
  const nextTargetSwitchCompletionSequenceRef = useRef(1);
  const instructionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const humanFeedbackInputRef = useRef<HTMLTextAreaElement | null>(null);
  const contextInputRef = useRef<HTMLTextAreaElement | null>(null);
  const deferredTurns = useDeferredValue(viewState.turns);
  const deferredFileEvents = useDeferredValue(viewState.fileEvents);
  const deferredContextHistory = useDeferredValue(viewState.contextHistory);
  const activePage = resolveUiPage(
    typeof window === "undefined" ? "/" : window.location.pathname,
  );
  const activeInstructionInputRef =
    activePage === "human-feedback"
      ? humanFeedbackInputRef
      : instructionInputRef;
  const hasUnlockedAccess =
    accessState.checked &&
    (!accessState.required || accessState.authenticated);
  const workbenchComposerBehavior = resolveWorkbenchComposerBehavior({
    connectionState: viewState.connectionState,
    ultimateState: viewState.ultimateState,
    armed: ultimateArmed,
  });
  const humanFeedbackBehavior = resolveHumanFeedbackBehavior({
    ultimateState: viewState.ultimateState,
  });

  useEffect(() => {
    if (viewState.ultimateState.phase !== "idle" && ultimateArmed) {
      setUltimateArmed(false);
    }
  }, [ultimateArmed, viewState.ultimateState.phase]);

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

  useEffect(() => {
    function handleGlobalKeyDown(event: globalThis.KeyboardEvent): void {
      const target = event.target as HTMLElement;
      const isInput =
        target.tagName === "TEXTAREA" ||
        target.tagName === "INPUT" ||
        target.isContentEditable;

      if (event.key === "k" && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
        event.preventDefault();
        activeInstructionInputRef.current?.focus();
        return;
      }

      if (isInput) return;

      if (event.key === "b" && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
        event.preventDefault();
        toggleLeftSidebar();
        return;
      }

      if (event.key === "b" && (event.metaKey || event.ctrlKey) && event.shiftKey) {
        event.preventDefault();
        toggleRightSidebar();
      }
    }

    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [activeInstructionInputRef, toggleLeftSidebar, toggleRightSidebar]);

  const applyMessage = useEffectEvent((message: BackendToFrontendMessage) => {
    if (message.type === "session:state") {
      hasSessionRef.current = true;
    }

    if (message.type === "target:switch_complete") {
      setLastTargetSwitchCompletion({
        ...message,
        receivedAt: new Date().toISOString(),
        sequence: nextTargetSwitchCompletionSequenceRef.current,
      });
      nextTargetSwitchCompletionSequenceRef.current += 1;
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
        window.history.replaceState(
          {},
          document.title,
          bootstrapAccess.sanitizedRelativeUrl,
        );
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

  useEffect(() => {
    const nextSessionId = viewState.sessionState?.sessionId ?? null;

    if (nextSessionId === lastSessionIdRef.current) {
      return;
    }

    lastSessionIdRef.current = nextSessionId;
    setLocalUploads([]);
  }, [viewState.sessionState?.sessionId]);

  const sendMessage = useCallback((message: FrontendToBackendMessage): boolean => {
    return socketManagerRef.current?.send(JSON.stringify(message)) ?? false;
  }, []);

  const queueComposerNotice = useCallback((notice: ComposerNotice): void => {
    setComposerNotice(notice);
  }, []);

  function focusInstructionInput(): void {
    window.requestAnimationFrame(() => {
      instructionInputRef.current?.focus();
    });
  }

  function focusHumanFeedbackInput(): void {
    window.requestAnimationFrame(() => {
      humanFeedbackInputRef.current?.focus();
    });
  }

  const handleAttachFiles = useCallback(async (files: File[]): Promise<void> => {
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
              : upload,
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
        currentUploads.filter((upload) => !uploadingIds.has(upload.id)),
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
            : upload,
        ),
      );
      queueComposerNotice({
        tone: "danger",
        title: "Upload failed",
        detail: errorMessage,
      });
    }
  }, [localUploads, queueComposerNotice, viewState.pendingUploads, viewState.sessionState?.sessionId]);

  const handleRemoveAttachment = useCallback(async (attachmentId: string): Promise<void> => {
    const localAttachment = localUploads.find((upload) => upload.id === attachmentId);

    if (localAttachment) {
      setLocalUploads((currentUploads) =>
        currentUploads.filter((upload) => upload.id !== attachmentId),
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
  }, [localUploads, queueComposerNotice, viewState.sessionState?.sessionId]);

  const handleCancelInstruction = useCallback(() => {
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
  }, [queueComposerNotice, sendMessage]);

  const handleToggleUltimateArmed = useCallback((): void => {
    if (viewState.ultimateState.phase === "stopping") {
      queueComposerNotice({
        tone: "warning",
        title: "Ultimate mode is stopping",
        detail:
          "Wait for the active loop to finish stopping before arming another ultimate run.",
      });
      return;
    }

    if (viewState.ultimateState.active) {
      queueComposerNotice({
        tone: "neutral",
        title: "Ultimate mode is already active",
        detail:
          "The next send will queue feedback for the active loop instead of starting a new one.",
      });
      return;
    }

    if (viewState.connectionState === "agent-busy") {
      queueComposerNotice({
        tone: "warning",
        title: "Shipyard is still busy",
        detail:
          "Wait for the current non-ultimate turn to finish before arming ultimate mode.",
      });
      return;
    }

    setUltimateArmed((currentValue) => !currentValue);
    focusInstructionInput();
  }, [
    queueComposerNotice,
    viewState.connectionState,
    viewState.ultimateState.active,
    viewState.ultimateState.phase,
  ]);

  const handlePrimeUltimateStart = useCallback((): void => {
    if (
      viewState.ultimateState.active ||
      viewState.ultimateState.phase === "stopping"
    ) {
      return;
    }

    if (viewState.connectionState === "agent-busy") {
      queueComposerNotice({
        tone: "warning",
        title: "Shipyard is still busy",
        detail:
          "Wait for the current non-ultimate turn to finish before starting ultimate mode.",
      });
      return;
    }

    setUltimateArmed(true);
    focusInstructionInput();
  }, [
    queueComposerNotice,
    viewState.connectionState,
    viewState.ultimateState.active,
    viewState.ultimateState.phase,
  ]);

  const handleSendUltimateFeedback = useCallback((
    text: string,
    injectedContext?: string[],
  ): boolean => {
    const normalizedText = text.trim();

    if (!normalizedText) {
      queueComposerNotice({
        tone: "danger",
        title: "Feedback required",
        detail: "Enter feedback before queuing it for the active ultimate loop.",
      });
      return false;
    }

    if (viewState.ultimateState.phase === "stopping") {
      queueComposerNotice({
        tone: "warning",
        title: "Ultimate mode is stopping",
        detail:
          "Shipyard is finishing the current cycle and is not accepting more loop feedback right now.",
      });
      return false;
    }

    const sent = sendMessage({
      type: "ultimate:feedback",
      text: normalizedText,
      injectedContext,
    });

    if (!sent) {
      queueComposerNotice({
        tone: "danger",
        title: "Browser runtime disconnected",
        detail:
          "Wait for reconnect or refresh the session before queuing more loop feedback.",
      });
      return false;
    }

    return true;
  }, [queueComposerNotice, sendMessage, viewState.ultimateState.phase]);

  const handleStopUltimateMode = useCallback((): void => {
    const sent = sendMessage({
      type: "ultimate:toggle",
      enabled: false,
    });

    if (!sent) {
      queueComposerNotice({
        tone: "danger",
        title: "Stop unavailable",
        detail:
          "The browser runtime is disconnected. Reconnect before stopping ultimate mode.",
      });
      return;
    }

    queueComposerNotice({
      tone: "neutral",
      title: "Stopping ultimate mode",
      detail:
        "Shipyard is finishing the current cycle and will return to idle as soon as it can stop cleanly.",
    });
  }, [queueComposerNotice, sendMessage]);

  const submitInstruction = useCallback(() => {
    if (
      shouldCancelBusyInstructionOnSubmit(
        activePage,
        viewState.connectionState,
        viewState.ultimateState.active,
      )
    ) {
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

    const attachedUploadCount = viewState.pendingUploads.length;
    const explicitContextCount = submission.injectedContext?.length ?? 0;
    const contextItemCount = attachedUploadCount + explicitContextCount;
    const contextItemLabel = `Attached ${String(contextItemCount)} context item${contextItemCount === 1 ? "" : "s"}`;

    switch (workbenchComposerBehavior.mode) {
      case "ultimate-stopping":
        queueComposerNotice({
          tone: "warning",
          title: "Ultimate mode is stopping",
          detail:
            "Wait for the current cycle to stop before starting another loop or queuing more feedback.",
        });
        return;
      case "ultimate-start": {
        const sent = sendMessage({
          type: "ultimate:toggle",
          enabled: true,
          brief: submission.instruction,
          injectedContext: submission.injectedContext,
        });

        if (!sent) {
          queueComposerNotice({
            tone: "danger",
            title: "Browser runtime disconnected",
            detail:
              "Wait for reconnect or refresh the session before starting ultimate mode.",
          });
          return;
        }

        setUltimateArmed(false);
        setInstruction("");
        setContextDraft(submission.clearedContextDraft);
        queueComposerNotice(
          contextItemCount > 0
            ? {
                tone: "success",
                title: "Ultimate mode starting",
                detail:
                  `${contextItemLabel} to the standing brief and Shipyard is starting the loop now.`,
              }
            : {
                tone: "success",
                title: "Ultimate mode starting",
                detail:
                  "Shipyard accepted the standing brief and is starting the loop now.",
              },
        );
        focusInstructionInput();
        return;
      }
      case "ultimate-feedback": {
        const sent = handleSendUltimateFeedback(
          submission.instruction,
          submission.injectedContext,
        );

        if (!sent) {
          return;
        }

        setInstruction("");
        setContextDraft(submission.clearedContextDraft);
        queueComposerNotice(
          contextItemCount > 0
            ? {
                tone: "success",
                title: "Feedback queued",
                detail:
                  `${contextItemLabel} for the active ultimate loop and Shipyard will apply it on the next review cycle.`,
              }
            : {
                tone: "success",
                title: "Feedback queued",
                detail:
                  "Shipyard accepted the note for the active ultimate loop.",
              },
        );
        focusInstructionInput();
        return;
      }
      case "cancel":
        handleCancelInstruction();
        return;
      case "instruction":
      default: {
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
        queueComposerNotice(
          contextItemCount > 0
            ? {
                tone: "success",
                title: attachedUploadCount > 0 ? "Attachments queued" : "Context attached",
                detail: `${contextItemLabel} to the next turn.`,
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
    }
  }, [
    activePage,
    contextDraft,
    handleCancelInstruction,
    handleSendUltimateFeedback,
    instruction,
    queueComposerNotice,
    workbenchComposerBehavior.mode,
    viewState.connectionState,
    viewState.pendingUploads,
    viewState.ultimateState.active,
    sendMessage,
  ]);

  const submitHumanFeedback = useCallback(() => {
    if (humanFeedbackBehavior.submitDisabled) {
      queueComposerNotice({
        tone: "warning",
        title: "Ultimate mode is stopping",
        detail: humanFeedbackBehavior.helpText,
      });
      focusHumanFeedbackInput();
      return;
    }

    const submission = prepareInstructionSubmission(
      humanFeedbackInstruction,
      "",
      [],
    );

    if (submission === null) {
      queueComposerNotice({
        tone: "danger",
        title: "Feedback required",
        detail: "Enter feedback before queuing it for ultimate mode.",
      });
      focusHumanFeedbackInput();
      return;
    }

    const sent = viewState.ultimateState.active
      ? handleSendUltimateFeedback(
          submission.instruction,
          submission.injectedContext,
        )
      : sendMessage({
          type: "instruction",
          text: submission.instruction,
          injectedContext: submission.injectedContext,
        });

    if (!sent) {
      if (!viewState.ultimateState.active) {
        queueComposerNotice({
          tone: "danger",
          title: "Browser runtime disconnected",
          detail:
            "Wait for reconnect or refresh the session before submitting another note.",
        });
      }
      return;
    }

    setHumanFeedbackInstruction("");
    queueComposerNotice({
      tone: "success",
      title: viewState.ultimateState.active
        ? "Feedback queued"
        : "Instruction queued",
      detail: viewState.ultimateState.active
        ? "Shipyard accepted the note for the active ultimate loop."
        : "Shipyard accepted the note as a normal browser instruction because ultimate mode is idle.",
    });
    focusHumanFeedbackInput();
  }, [
    handleSendUltimateFeedback,
    humanFeedbackBehavior.helpText,
    humanFeedbackBehavior.submitDisabled,
    humanFeedbackInstruction,
    queueComposerNotice,
    sendMessage,
    viewState.ultimateState.active,
  ]);

  const handleInstructionSubmit = useCallback((event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    submitInstruction();
  }, [submitInstruction]);

  const handleHumanFeedbackSubmit = useCallback((event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    submitHumanFeedback();
  }, [submitHumanFeedback]);

  const handleComposerKeyDown = useCallback((
    event: KeyboardEvent<HTMLTextAreaElement>,
  ): void => {
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
  }, [contextDraft, queueComposerNotice, submitInstruction]);

  const handleHumanFeedbackKeyDown = useCallback((
    event: KeyboardEvent<HTMLTextAreaElement>,
  ): void => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submitHumanFeedback();
    }
  }, [submitHumanFeedback]);

  const handleInstructionChange = useCallback((value: string): void => {
    setInstruction(value);
    if (composerNotice) setComposerNotice(null);
  }, [composerNotice]);

  const handleHumanFeedbackInstructionChange = useCallback((value: string): void => {
    setHumanFeedbackInstruction(value);
    if (composerNotice) setComposerNotice(null);
  }, [composerNotice]);

  const handleAccessTokenChange = useCallback((value: string): void => {
    setAccessToken(value);

    if (accessState.message) {
      setAccessState((currentState) => ({
        ...currentState,
        message: null,
      }));
    }
  }, [accessState.message]);

  const handleContextChange = useCallback((value: string): void => {
    setContextDraft(value);
    if (composerNotice) setComposerNotice(null);
  }, [composerNotice]);

  const handleClearContext = useCallback((): void => {
    setContextDraft("");
    queueComposerNotice({
      tone: "neutral",
      title: "Context cleared",
      detail:
        "The next turn will run without extra injected context unless you add a new note.",
    });
    focusInstructionInput();
  }, [queueComposerNotice]);

  const handleCopyTracePath = useCallback((): void => {
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
  }, [viewState.sessionState?.tracePath]);

  const handleTargetSwitch = useCallback((
    targetPath: string,
    options: {
      requestId?: string;
    } = {},
  ): boolean => {
    const sent = sendMessage({
      type: "target:switch_request",
      targetPath,
      requestId: options.requestId,
    });

    if (!sent) {
      queueComposerNotice({
        tone: "danger",
        title: "Target switch unavailable",
        detail:
          "The browser runtime is disconnected. Reconnect before switching targets.",
      });
    }

    return sent;
  }, [queueComposerNotice, sendMessage]);

  const handleSessionResume = useCallback((sessionId: string): void => {
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
  }, [queueComposerNotice, sendMessage]);

  const handleTargetCreate = useCallback((input: {
    name: string;
    description: string;
    initialInstruction?: string;
    scaffoldType: "react-ts" | "express-ts" | "python" | "go" | "empty";
  }, options: {
    requestId?: string;
  } = {}): boolean => {
    const sent = sendMessage({
      type: "target:create_request",
      name: input.name,
      description: input.description,
      initialInstruction: input.initialInstruction,
      scaffoldType: input.scaffoldType,
      requestId: options.requestId,
    });

    if (!sent) {
      queueComposerNotice({
        tone: "danger",
        title: "Target creation unavailable",
        detail:
          "The browser runtime is disconnected. Reconnect before creating a target.",
      });
    }

    return sent;
  }, [queueComposerNotice, sendMessage]);

  const handleProjectActivate = useCallback((projectId: string): void => {
    const sent = sendMessage({
      type: "project:activate_request",
      projectId,
    });

    if (!sent) {
      queueComposerNotice({
        tone: "danger",
        title: "Project switch unavailable",
        detail:
          "The browser runtime is disconnected. Reconnect before switching projects.",
      });
      return;
    }

    queueComposerNotice({
      tone: "neutral",
      title: "Opening project",
      detail:
        "Shipyard is moving the workbench to the selected project while any background work keeps running.",
    });
  }, [queueComposerNotice, sendMessage]);

  const handleHostedAccessSubmit = useCallback(async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
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
  }, [accessToken, applyHostedAccessState, submitHostedAccessToken]);

  const handleRefreshStatus = useCallback((): void => {
    sendMessage({ type: "status" });
  }, [sendMessage]);

  const composerAttachments: ComposerAttachment[] = [
    ...localUploads,
    ...viewState.pendingUploads.map((receipt) => ({
      id: receipt.id,
      label: receipt.originalName,
      detail: createAttachmentDetail(receipt),
      status: "attached" as const,
    })),
  ];

  return {
    activePage,
    accessState,
    accessSubmitting,
    accessToken,
    composerAttachments,
    composerBehavior: workbenchComposerBehavior,
    composerNotice,
    contextDraft,
    deferredContextHistory,
    deferredFileEvents,
    deferredTurns,
    hasUnlockedAccess,
    humanFeedbackBehavior,
    humanFeedbackInstruction,
    humanFeedbackInputRef,
    instruction,
    instructionInputRef,
    leftSidebarOpen,
    lastTargetSwitchCompletion,
    onActivateUltimate: handlePrimeUltimateStart,
    onAccessTokenChange: handleAccessTokenChange,
    onAccessSubmit: handleHostedAccessSubmit,
    onActivateProject: handleProjectActivate,
    onAttachFiles: handleAttachFiles,
    onCancelInstruction: handleCancelInstruction,
    onClearContext: handleClearContext,
    onContextChange: handleContextChange,
    onContextKeyDown: handleComposerKeyDown,
    onCopyTracePath: handleCopyTracePath,
    onHumanFeedbackInstructionChange: handleHumanFeedbackInstructionChange,
    onHumanFeedbackKeyDown: handleHumanFeedbackKeyDown,
    onInstructionChange: handleInstructionChange,
    onInstructionKeyDown: handleComposerKeyDown,
    onRefreshStatus: handleRefreshStatus,
    onRemoveAttachment: handleRemoveAttachment,
    onRequestSessionResume: handleSessionResume,
    onRequestTargetCreate: handleTargetCreate,
    onRequestTargetSwitch: handleTargetSwitch,
    onSendUltimateFeedback: handleSendUltimateFeedback,
    onStopUltimateMode: handleStopUltimateMode,
    onSubmitHumanFeedback: handleHumanFeedbackSubmit,
    onSubmitInstruction: handleInstructionSubmit,
    onToggleLeftSidebar: toggleLeftSidebar,
    onToggleRightSidebar: toggleRightSidebar,
    onToggleUltimateArmed: handleToggleUltimateArmed,
    rightSidebarOpen,
    traceButtonLabel,
    ultimateArmed,
    viewState,
    contextInputRef,
  };
}
