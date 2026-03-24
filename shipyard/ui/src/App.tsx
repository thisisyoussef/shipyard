import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type FormEvent,
} from "react";

import type {
  BackendToFrontendMessage,
  FrontendToBackendMessage,
} from "../../src/ui/contracts.js";
import { backendToFrontendMessageSchema } from "../../src/ui/contracts.js";
import { ShipyardWorkbench } from "./ShipyardWorkbench.js";
import {
  applyBackendMessage,
  createInitialWorkbenchState,
  prepareInstructionSubmission,
  queueInstructionTurn,
  setTransportState,
} from "./view-models.js";

function createSocketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

export function App() {
  const [viewState, setViewState] = useState(createInitialWorkbenchState);
  const [instruction, setInstruction] = useState("");
  const [contextDraft, setContextDraft] = useState("");
  const [traceButtonLabel, setTraceButtonLabel] = useState("Copy trace path");
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const hasSessionRef = useRef(false);
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
    let disposed = false;

    const connect = () => {
      if (disposed) {
        return;
      }

      applyTransportState(
        "connecting",
        hasSessionRef.current
          ? "Reconnecting to Shipyard..."
          : "Connecting to Shipyard...",
      );

      const socket = new WebSocket(createSocketUrl());
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        const statusMessage: FrontendToBackendMessage = { type: "status" };
        socket.send(JSON.stringify(statusMessage));
      });

      socket.addEventListener("message", (event) => {
        let rawMessage: unknown;

        try {
          rawMessage = JSON.parse(event.data as string);
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
      });

      socket.addEventListener("error", () => {
        applyTransportState("error", "Connection error. Waiting to retry...");
      });

      socket.addEventListener("close", () => {
        socketRef.current = null;

        if (disposed) {
          applyTransportState("disconnected", "Shipyard UI disconnected.");
          return;
        }

        applyTransportState("connecting", "Reconnecting to Shipyard...");
        reconnectTimerRef.current = window.setTimeout(connect, 1_500);
      });
    };

    connect();

    return () => {
      disposed = true;

      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }

      socketRef.current?.close();
    };
  }, [applyMessage, applyTransportState]);

  function sendMessage(message: FrontendToBackendMessage): boolean {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      applyTransportState(
        "error",
        "Cannot send instructions while the browser runtime is disconnected.",
      );
      return false;
    }

    socketRef.current.send(JSON.stringify(message));
    return true;
  }

  function handleInstructionSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const submission = prepareInstructionSubmission(instruction, contextDraft);

    if (submission === null) {
      return;
    }

    const sent = sendMessage({
      type: "instruction",
      text: submission.instruction,
      injectedContext: submission.injectedContext,
    });

    if (!sent) {
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
      onInstructionChange={setInstruction}
      onContextChange={setContextDraft}
      onClearContext={() => setContextDraft("")}
      onSubmitInstruction={handleInstructionSubmit}
      onRefreshStatus={() => sendMessage({ type: "status" })}
      onCopyTracePath={handleCopyTracePath}
      traceButtonLabel={traceButtonLabel}
    />
  );
}
