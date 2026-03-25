export const DEFAULT_TURN_CANCELLED_REASON =
  "Operator interrupted the active turn.";

function coerceCancellationReason(
  reason: unknown,
  fallback = DEFAULT_TURN_CANCELLED_REASON,
): string {
  if (reason instanceof Error) {
    return reason.message || fallback;
  }

  if (typeof reason === "string" && reason.trim()) {
    return reason.trim();
  }

  return fallback;
}

export class TurnCancelledError extends Error {
  constructor(message = DEFAULT_TURN_CANCELLED_REASON) {
    super(message);
    this.name = "TurnCancelledError";
  }
}

export function createTurnCancelledError(
  reason: unknown = DEFAULT_TURN_CANCELLED_REASON,
): TurnCancelledError {
  if (reason instanceof TurnCancelledError) {
    return reason;
  }

  return new TurnCancelledError(coerceCancellationReason(reason));
}

export function getTurnCancellationReason(
  signal?: AbortSignal,
  fallback = DEFAULT_TURN_CANCELLED_REASON,
): string | null {
  if (!signal?.aborted) {
    return null;
  }

  return coerceCancellationReason(signal.reason, fallback);
}

export function throwIfTurnCancelled(
  signal?: AbortSignal,
  fallback = DEFAULT_TURN_CANCELLED_REASON,
): void {
  if (!signal?.aborted) {
    return;
  }

  throw createTurnCancelledError(signal.reason ?? fallback);
}

export function toTurnCancelledError(
  error: unknown,
  signal?: AbortSignal,
  fallback = DEFAULT_TURN_CANCELLED_REASON,
): TurnCancelledError | null {
  const signalReason = getTurnCancellationReason(signal, fallback);

  if (signalReason) {
    return createTurnCancelledError(signalReason);
  }

  if (error instanceof TurnCancelledError) {
    return error;
  }

  if (
    error instanceof Error &&
    (error.name === "AbortError" ||
      /aborted|cancelled|canceled/i.test(error.message))
  ) {
    return createTurnCancelledError(error.message || fallback);
  }

  return null;
}

export function abortTurn(
  controller: AbortController,
  reason = DEFAULT_TURN_CANCELLED_REASON,
): void {
  if (controller.signal.aborted) {
    return;
  }

  controller.abort(createTurnCancelledError(reason));
}
