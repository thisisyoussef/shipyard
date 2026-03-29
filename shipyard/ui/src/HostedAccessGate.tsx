import type { FormEvent } from "react";

interface HostedAccessGateProps {
  accessToken: string;
  checking?: boolean;
  submitting?: boolean;
  message: string | null;
  onAccessTokenChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

function getStatusModel(props: HostedAccessGateProps): {
  tone: "neutral" | "accent" | "danger";
  message: string;
} {
  if (props.message) {
    return {
      tone: "danger",
      message: props.message,
    };
  }

  if (props.checking) {
    return {
      tone: "accent",
      message:
        "Checking the hosted access token and restoring the shared Shipyard session.",
    };
  }

  if (props.submitting) {
    return {
      tone: "accent",
      message:
        "Unlocking Shipyard and reconnecting the shared workspace.",
    };
  }

  return {
    tone: "neutral",
    message:
      "Shipyard keeps the shared token out of its persisted session artifacts and prompt traces.",
  };
}

export function HostedAccessGate(props: HostedAccessGateProps) {
  const busy = props.checking || props.submitting;
  const buttonLabel = props.checking
    ? "Checking access..."
    : props.submitting
      ? "Unlocking..."
      : "Unlock Shipyard";
  const status = getStatusModel(props);

  return (
    <main className="hosted-access-shell">
      <section
        className="hosted-access-card"
        aria-labelledby="hosted-access-title"
        aria-busy={busy}
      >
        <span className="hosted-access-kicker">Hosted access</span>
        <h1 id="hosted-access-title">Unlock the shared Shipyard workspace</h1>
        <p className="hosted-access-copy">
          Enter the shared token to unlock this hosted Shipyard session before
          the editor, traces, and agent loop come online.
        </p>

        <form className="hosted-access-form" onSubmit={props.onSubmit}>
          <label className="hosted-access-field" htmlFor="hosted-access-token">
            <span>Shared access token</span>
            <input
              id="hosted-access-token"
              type="password"
              autoComplete="current-password"
              value={props.accessToken}
              onChange={(event) => props.onAccessTokenChange(event.target.value)}
              placeholder="Enter the hosted access token"
              disabled={busy}
              aria-describedby={props.message ? "hosted-access-message" : undefined}
            />
          </label>

          <button type="submit" className="hosted-access-submit" disabled={busy}>
            {buttonLabel}
          </button>
        </form>

        <p
          id="hosted-access-message"
          className="hosted-access-message"
          data-tone={status.tone}
          role={status.tone === "danger" ? "alert" : "status"}
          aria-live={status.tone === "danger" ? "assertive" : "polite"}
        >
          {status.message}
        </p>
      </section>
    </main>
  );
}
