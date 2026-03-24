import { useEffect, useRef, useState, type FormEvent } from "react";

import type {
  BackendToFrontendMessage,
  FrontendToBackendMessage,
} from "../../src/ui/contracts.js";
import { backendToFrontendMessageSchema } from "../../src/ui/contracts.js";

type SessionStateMessage = Extract<
  BackendToFrontendMessage,
  { type: "session:state" }
>;

function createSocketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

export function App() {
  const [connectionState, setConnectionState] = useState(
    "connecting",
  );
  const [instruction, setInstruction] = useState("");
  const [sessionState, setSessionState] = useState<SessionStateMessage | null>(
    null,
  );
  const [messages, setMessages] = useState<BackendToFrontendMessage[]>([]);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const socket = new WebSocket(createSocketUrl());
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      setConnectionState("connecting");
      const statusMessage: FrontendToBackendMessage = { type: "status" };
      socket.send(JSON.stringify(statusMessage));
    });

    socket.addEventListener("message", (event) => {
      const parsed = backendToFrontendMessageSchema.safeParse(
        JSON.parse(event.data as string),
      );

      if (!parsed.success) {
        setConnectionState("error");
        return;
      }

      const nextMessage = parsed.data;

      if (nextMessage.type === "session:state") {
        setSessionState(nextMessage);
        setConnectionState(nextMessage.connectionState);
      } else {
        setMessages((currentMessages) => [
          nextMessage,
          ...currentMessages.slice(0, 11),
        ]);

        if (nextMessage.type === "agent:error") {
          setConnectionState("error");
        } else if (nextMessage.type === "agent:thinking") {
          setConnectionState("agent-busy");
        } else if (nextMessage.type === "agent:done") {
          setConnectionState("ready");
        }
      }
    });

    socket.addEventListener("close", () => {
      setConnectionState("disconnected");
      socketRef.current = null;
    });

    socket.addEventListener("error", () => {
      setConnectionState("error");
    });

    return () => {
      socket.close();
    };
  }, []);

  function sendMessage(message: FrontendToBackendMessage): void {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      return;
    }

    socketRef.current.send(JSON.stringify(message));
  }

  function handleInstructionSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!instruction.trim()) {
      return;
    }

    sendMessage({
      type: "instruction",
      text: instruction,
    });
    setInstruction("");
  }

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <span className="eyebrow">Shipyard UI Runtime</span>
          <h1>One engine, two control surfaces.</h1>
          <p>
            Browser mode is now a first-class runtime contract over the same
            session model that powers the terminal loop. This shell will grow
            into the diff-first developer console in the next pre-2 stories.
          </p>
        </div>
        <div className="status-pill" data-state={connectionState}>
          {connectionState}
        </div>
      </section>

      <section className="app-grid">
        <article className="panel">
          <header className="panel-header">
            <h2>Session</h2>
            <button
              type="button"
              className="secondary-button"
              onClick={() => sendMessage({ type: "status" })}
            >
              Refresh status
            </button>
          </header>
          {sessionState ? (
            <dl className="definition-grid">
              <div>
                <dt>Session ID</dt>
                <dd>{sessionState.sessionId}</dd>
              </div>
              <div>
                <dt>Target</dt>
                <dd>{sessionState.targetLabel}</dd>
              </div>
              <div>
                <dt>Turns</dt>
                <dd>{sessionState.turnCount}</dd>
              </div>
              <div>
                <dt>Discovery</dt>
                <dd>{sessionState.discoverySummary}</dd>
              </div>
            </dl>
          ) : (
            <p className="muted-copy">Waiting for the session bridge.</p>
          )}
        </article>

        <article className="panel">
          <header className="panel-header">
            <h2>Runtime Contract</h2>
          </header>
          <ul className="contract-list">
            <li>`instruction` sends text plus optional injected context.</li>
            <li>`cancel` reserves the control path for interrupt support.</li>
            <li>`status` rehydrates the shared session snapshot.</li>
            <li>
              `agent:*` and `session:state` messages are already typed and ready
              for the real activity stream.
            </li>
          </ul>
        </article>
      </section>

      <section className="panel workbench-panel">
        <header className="panel-header">
          <h2>Instruction Probe</h2>
          <button
            type="button"
            className="secondary-button"
            onClick={() => sendMessage({ type: "cancel" })}
          >
            Cancel placeholder
          </button>
        </header>
        <form className="instruction-form" onSubmit={handleInstructionSubmit}>
          <label className="instruction-label" htmlFor="instruction">
            Send a browser instruction against the runtime contract
          </label>
          <textarea
            id="instruction"
            className="instruction-input"
            rows={4}
            placeholder="Ask Shipyard to inspect a file or explain the next diff."
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
          />
          <button type="submit" className="primary-button">
            Send instruction
          </button>
        </form>
      </section>

      <section className="panel">
        <header className="panel-header">
          <h2>Recent Messages</h2>
        </header>
        <div className="message-stack">
          {messages.length === 0 ? (
            <p className="muted-copy">
              No streamed agent events yet. PRE2-S02 will wire the real activity
              feed.
            </p>
          ) : (
            messages.map((message, index) => (
              <pre key={`${message.type}-${String(index)}`} className="message-card">
                {JSON.stringify(message, null, 2)}
              </pre>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
