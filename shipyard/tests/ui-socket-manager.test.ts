import { describe, expect, it } from "vitest";

import {
  createSocketManager,
  type SocketLike,
  type SocketMessageEventLike,
} from "../ui/src/socket-manager.js";

class FakeTimerApi {
  private nextTimerId = 1;
  private callbacks = new Map<number, () => void>();

  setTimeout = (callback: () => void): number => {
    const timerId = this.nextTimerId;
    this.nextTimerId += 1;
    this.callbacks.set(timerId, callback);
    return timerId;
  };

  clearTimeout = (timerId: number): void => {
    this.callbacks.delete(timerId);
  };

  pendingCount(): number {
    return this.callbacks.size;
  }

  runNext(): void {
    const [timerId, callback] = this.callbacks.entries().next().value ?? [];

    if (timerId === undefined || callback === undefined) {
      throw new Error("No timer is pending.");
    }

    this.callbacks.delete(timerId);
    callback();
  }

  runAll(): void {
    while (this.callbacks.size > 0) {
      this.runNext();
    }
  }
}

class FakeSocket implements SocketLike {
  readyState = 0;
  readonly sentMessages: string[] = [];
  private openListeners: Array<() => void> = [];
  private messageListeners: Array<(event: SocketMessageEventLike) => void> = [];
  private errorListeners: Array<() => void> = [];
  private closeListeners: Array<() => void> = [];

  addEventListener(type: "open", listener: () => void): void;
  addEventListener(
    type: "message",
    listener: (event: SocketMessageEventLike) => void,
  ): void;
  addEventListener(type: "error", listener: () => void): void;
  addEventListener(type: "close", listener: () => void): void;
  addEventListener(
    type: "open" | "message" | "error" | "close",
    listener:
      | (() => void)
      | ((event: SocketMessageEventLike) => void),
  ): void {
    switch (type) {
      case "open":
        this.openListeners.push(listener as () => void);
        break;
      case "message":
        this.messageListeners.push(
          listener as (event: SocketMessageEventLike) => void,
        );
        break;
      case "error":
        this.errorListeners.push(listener as () => void);
        break;
      case "close":
        this.closeListeners.push(listener as () => void);
        break;
    }
  }

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.emitClose();
  }

  emitOpen(): void {
    this.readyState = 1;
    this.openListeners.forEach((listener) => listener());
  }

  emitMessage(data: string): void {
    this.messageListeners.forEach((listener) => listener({ data }));
  }

  emitError(): void {
    this.errorListeners.forEach((listener) => listener());
  }

  emitClose(): void {
    this.readyState = 3;
    this.closeListeners.forEach((listener) => listener());
  }
}

describe("createSocketManager", () => {
  it("ignores stale close events after reconnecting to a newer socket", () => {
    const timerApi = new FakeTimerApi();
    const sockets: FakeSocket[] = [];
    const transportEvents: Array<{ state: string; status: string }> = [];
    const manager = createSocketManager({
      url: "ws://127.0.0.1:3210/ws",
      hasSessionState: () => true,
      createSocket() {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      timerApi,
      onMessage() {},
      onTransportState(state, status) {
        transportEvents.push({ state, status });
      },
    });

    manager.start();
    expect(sockets).toHaveLength(1);

    const firstSocket = sockets[0]!;
    firstSocket.emitOpen();
    firstSocket.emitClose();

    expect(timerApi.pendingCount()).toBe(1);
    timerApi.runNext();
    expect(sockets).toHaveLength(2);

    const secondSocket = sockets[1]!;
    secondSocket.emitOpen();
    expect(timerApi.pendingCount()).toBe(0);
    const transportEventCount = transportEvents.length;

    firstSocket.emitClose();

    expect(timerApi.pendingCount()).toBe(0);
    expect(sockets).toHaveLength(2);
    expect(manager.send("ping")).toBe(true);
    expect(secondSocket.sentMessages).toEqual(["ping"]);
    expect(transportEvents).toHaveLength(transportEventCount);
  });

  it("does not create a second socket while one is already connecting", () => {
    const sockets: FakeSocket[] = [];
    const manager = createSocketManager({
      url: "ws://127.0.0.1:3210/ws",
      hasSessionState: () => false,
      createSocket() {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      onMessage() {},
      onTransportState() {},
    });

    manager.start();
    manager.start();

    expect(sockets).toHaveLength(1);
  });

  it("cancels pending reconnects when the manager stops", () => {
    const timerApi = new FakeTimerApi();
    const sockets: FakeSocket[] = [];
    const transportEvents: Array<{ state: string; status: string }> = [];
    const manager = createSocketManager({
      url: "ws://127.0.0.1:3210/ws",
      hasSessionState: () => true,
      createSocket() {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      timerApi,
      onMessage() {},
      onTransportState(state, status) {
        transportEvents.push({ state, status });
      },
    });

    manager.start();
    sockets[0]?.emitClose();
    expect(timerApi.pendingCount()).toBe(1);

    manager.stop();
    timerApi.runAll();

    expect(timerApi.pendingCount()).toBe(0);
    expect(sockets).toHaveLength(1);
    expect(transportEvents.at(-1)).toEqual({
      state: "disconnected",
      status: "Shipyard UI disconnected.",
    });
  });
});
