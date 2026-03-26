import { describe, expect, it } from "vitest";

import {
  CODE_PHASE_MODEL_ROUTE,
  PLANNER_MODEL_ROUTE,
  TARGET_ENRICHMENT_MODEL_ROUTE,
  TARGET_MANAGER_PHASE_MODEL_ROUTE,
  createModelRoutingConfig,
  resolveModelRoute,
  resolveModelRouteCapability,
} from "../src/engine/model-routing.js";
import { createCodePhase } from "../src/phases/code/index.js";
import { createTargetManagerPhase } from "../src/phases/target-manager/index.js";

describe("model routing", () => {
  it("keeps phase routing declarative and provider-neutral", () => {
    expect(createCodePhase().modelRoute).toBe(CODE_PHASE_MODEL_ROUTE);
    expect(createTargetManagerPhase().modelRoute).toBe(
      TARGET_MANAGER_PHASE_MODEL_ROUTE,
    );
  });

  it("resolves the global default route deterministically", () => {
    const routing = createModelRoutingConfig({
      env: {
        ANTHROPIC_API_KEY: "test-anthropic-key",
        SHIPYARD_ANTHROPIC_MODEL: "claude-global-env",
      },
    });

    expect(
      resolveModelRoute({
        routing,
        routeId: CODE_PHASE_MODEL_ROUTE,
        env: {
          ANTHROPIC_API_KEY: "test-anthropic-key",
          SHIPYARD_ANTHROPIC_MODEL: "claude-global-env",
        },
      }),
    ).toMatchObject({
      routeId: CODE_PHASE_MODEL_ROUTE,
      provider: "anthropic",
      model: "claude-global-env",
    });
  });

  it("lets route-specific overrides win over the global default while inheriting the provider", () => {
    const routing = createModelRoutingConfig({
      defaultRoute: {
        provider: "anthropic",
        model: "claude-default",
      },
      routes: {
        [PLANNER_MODEL_ROUTE]: {
          model: "claude-planner",
        },
      },
    });

    expect(
      resolveModelRoute({
        routing,
        routeId: PLANNER_MODEL_ROUTE,
      }),
    ).toMatchObject({
      provider: "anthropic",
      model: "claude-planner",
    });
    expect(
      resolveModelRoute({
        routing,
        routeId: CODE_PHASE_MODEL_ROUTE,
      }),
    ).toMatchObject({
      provider: "anthropic",
      model: "claude-default",
    });
  });

  it("fails clearly when the configured provider is unknown", () => {
    const routing = createModelRoutingConfig({
      defaultRoute: {
        provider: "mystery-provider",
      },
    });

    expect(() =>
      resolveModelRoute({
        routing,
        routeId: CODE_PHASE_MODEL_ROUTE,
      })
    ).toThrowError(/Unknown model provider "mystery-provider"/i);
  });

  it("returns provider-aware missing-credential diagnostics for target enrichment", () => {
    const routing = createModelRoutingConfig({
      defaultRoute: {
        provider: "anthropic",
      },
    });

    expect(
      resolveModelRouteCapability({
        routing,
        routeId: TARGET_ENRICHMENT_MODEL_ROUTE,
        env: {},
        requireAdapter: true,
      }),
    ).toMatchObject({
      available: false,
      provider: "anthropic",
      missingEnvironmentVariables: ["ANTHROPIC_API_KEY"],
      reason: expect.stringMatching(/ANTHROPIC_API_KEY/i),
    });
  });
});
