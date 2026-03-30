import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  extractBootstrapAccessToken,
} from "../ui/src/App.js";
import { HostedAccessGate } from "../ui/src/HostedAccessGate.js";
import { redactAccessToken } from "../src/ui/access.js";

describe("ui access helpers", () => {
  it("redacts shared access tokens from raw error strings", () => {
    expect(
      redactAccessToken(
        "Access failed for phase-nine-demo-token via /?access_token=phase-nine-demo-token",
        "phase-nine-demo-token",
      ),
    ).toBe(
      "Access failed for [redacted] via /?access_token=[redacted]",
    );
  });

  it("extracts bootstrap access tokens and preserves unrelated query params", () => {
    expect(
      extractBootstrapAccessToken(
        new URL("https://shipyard.example/?access_token=demo-token&view=preview#composer"),
      ),
    ).toEqual({
      token: "demo-token",
      sanitizedRelativeUrl: "/?view=preview#composer",
    });
  });
});

describe("HostedAccessGate", () => {
  it("renders a password input and invalid-token guidance", () => {
    const markup = renderToStaticMarkup(
      createElement(HostedAccessGate, {
        accessToken: "demo-token",
        submitting: false,
        message: "Invalid access token. Enter the shared token to continue.",
        onAccessTokenChange: () => undefined,
        onSubmit: () => undefined,
      }),
    );

    expect(markup).toContain("Hosted access");
    expect(markup).toContain("Unlock the shared Shipyard workspace");
    expect(markup).toContain('type="password"');
    expect(markup).toContain('autoComplete="current-password"');
    expect(markup).toContain("Invalid access token. Enter the shared token to continue.");
    expect(markup).toContain("Unlock Shipyard");
  });

  it("renders an explicit busy state while checking hosted access", () => {
    const markup = renderToStaticMarkup(
      createElement(HostedAccessGate, {
        accessToken: "demo-token",
        checking: true,
        submitting: false,
        message: null,
        onAccessTokenChange: () => undefined,
        onSubmit: () => undefined,
      }),
    );

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("Checking access...");
    expect(markup).toContain(
      "Checking the hosted access token and restoring the shared Shipyard session.",
    );
  });
});
