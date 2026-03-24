type TransportConnectionState =
  | "disconnected"
  | "connecting"
  | "ready"
  | "agent-busy"
  | "error";

export interface SocketMessageEventLike {
  data: string;
}

export interface SocketLike {
  readonly readyState: number;
  addEventListener(type: "open", listener: () => void): void;
  addEventListener(
    type: "message",
    listener: (event: SocketMessageEventLike) => void,
  ): void;
  addEventListener(type: "error", listener: () => void): void;
  addEventListener(type: "close", listener: () => void): void;
  send(data: string): void;
  close(): void;
}

interface TimerApi {
  setTimeout: (callback: () => void, delayMs: number) => number;
  clearTimeout: (timeoutId: number) => void;
}

export interface SocketManagerOptions {
  url: string;
  hasSessionState: () => boolean;
  onMessage: (rawMessage: string) => void;
  onOpen?: (socket: SocketLike) => void;
  onTransportState: (
    connectionState: TransportConnectionState,
    status: string,
  ) => void;
  createSocket?: (url: string) => SocketLike;
  reconnectDelayMs?: number;
  timerApi?: TimerApi;
}

export interface SocketManager {
  start: () => void;
  stop: () => void;
  send: (rawMessage: string) => boolean;
}

const SOCKET_CONNECTING = 0;
const SOCKET_OPEN = 1;

export function createSocketManager(
  options: SocketManagerOptions,
): SocketManager {
  const createSocket: (url: string) => SocketLike =
    options.createSocket ??
    ((url: string) => new WebSocket(url) as unknown as SocketLike);
  const timerApi = options.timerApi ?? {
    setTimeout: (callback: () => void, delayMs: number) =>
      window.setTimeout(callback, delayMs),
    clearTimeout: (timeoutId: number) => window.clearTimeout(timeoutId),
  };
  const reconnectDelayMs = options.reconnectDelayMs ?? 1_500;
  let activeSocket: SocketLike | null = null;
  let activeSocketToken = 0;
  let reconnectTimerId: number | null = null;
  let stopped = true;

  function clearReconnectTimer(): void {
    if (reconnectTimerId === null) {
      return;
    }

    timerApi.clearTimeout(reconnectTimerId);
    reconnectTimerId = null;
  }

  function scheduleReconnect(connect: () => void): void {
    if (stopped || reconnectTimerId !== null) {
      return;
    }

    reconnectTimerId = timerApi.setTimeout(() => {
      reconnectTimerId = null;
      connect();
    }, reconnectDelayMs);
  }

  const connect = () => {
    if (stopped) {
      return;
    }

    if (
      activeSocket &&
      (activeSocket.readyState === SOCKET_CONNECTING ||
        activeSocket.readyState === SOCKET_OPEN)
    ) {
      return;
    }

    options.onTransportState(
      "connecting",
      options.hasSessionState()
        ? "Reconnecting to Shipyard..."
        : "Connecting to Shipyard...",
    );

    const socket = createSocket(options.url);
    const socketToken = ++activeSocketToken;
    activeSocket = socket;

    socket.addEventListener("open", () => {
      if (stopped || activeSocket !== socket || activeSocketToken !== socketToken) {
        return;
      }

      clearReconnectTimer();
      options.onOpen?.(socket);
    });

    socket.addEventListener("message", (event) => {
      if (stopped || activeSocket !== socket || activeSocketToken !== socketToken) {
        return;
      }

      options.onMessage(event.data);
    });

    socket.addEventListener("error", () => {
      if (stopped || activeSocket !== socket || activeSocketToken !== socketToken) {
        return;
      }

      options.onTransportState("error", "Connection error. Waiting to retry...");
    });

    socket.addEventListener("close", () => {
      if (activeSocket !== socket || activeSocketToken !== socketToken) {
        return;
      }

      activeSocket = null;

      if (stopped) {
        options.onTransportState("disconnected", "Shipyard UI disconnected.");
        return;
      }

      options.onTransportState("connecting", "Reconnecting to Shipyard...");
      scheduleReconnect(connect);
    });
  };

  return {
    start() {
      if (!stopped) {
        return;
      }

      stopped = false;
      clearReconnectTimer();
      connect();
    },
    stop() {
      if (stopped) {
        return;
      }

      stopped = true;
      clearReconnectTimer();
      activeSocketToken += 1;
      const socket = activeSocket;
      activeSocket = null;
      socket?.close();
      options.onTransportState("disconnected", "Shipyard UI disconnected.");
    },
    send(rawMessage: string) {
      if (activeSocket?.readyState !== SOCKET_OPEN) {
        options.onTransportState(
          "error",
          "Cannot send instructions while the browser runtime is disconnected.",
        );
        return false;
      }

      activeSocket.send(rawMessage);
      return true;
    },
  };
}
