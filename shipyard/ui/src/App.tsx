import {
  startTransition,
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
import { backendToFrontendMessageSchema } from "../../src/ui/contracts.js";
import { validateContextDraft } from "./context-ui.js";
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

function createSocketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

export function App() {
  const [viewState, setViewState] = useState(createInitialWorkbenchState);
  const [instruction, setInstruction] = useState("");
  const [contextDraft, setContextDraft] = useState("");
  const [composerNotice, setComposerNotice] = useState<ComposerNotice | null>(
    null,
  );
  const [traceButtonLabel, setTraceButtonLabel] = useState("Copy trace path");
  const socketManagerRef = useRef<SocketManager | null>(null);
  const hasSessionRef = useRef(false);
  const instructionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const contextInputRef = useRef<HTMLTextAreaElement | null>(null);
  const deferredTurns = useDeferredValue(viewState.turns);
  const deferredFileEvents = useDeferredValue(viewState.fileEvents);
  const deferredContextHistory = useDeferredValue(viewState.contextHistory);

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
          setTransportState(currentState, connectionState, status)
        );
      });
    },
  );

  useEffect(() => {
    // Effect Events intentionally stay out of the dependency list so the socket
    // connection does not restart on every render.
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

  function submitInstruction(): void {
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
        )
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

    if (composerNotice) {
      setComposerNotice(null);
    }
  }

  function handleContextChange(value: string): void {
    setContextDraft(value);

    if (composerNotice) {
      setComposerNotice(null);
    }
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

    if (!tracePath) {
      return;
    }

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

  return (
    <ShipyardWorkbench
      sessionState={viewState.sessionState}
      turns={deferredTurns}
      fileEvents={deferredFileEvents}
      contextHistory={deferredContextHistory}
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
      onRefreshStatus={() => sendMessage({ type: "status" })}
      onCopyTracePath={handleCopyTracePath}
      traceButtonLabel={traceButtonLabel}
    />
  );
}
