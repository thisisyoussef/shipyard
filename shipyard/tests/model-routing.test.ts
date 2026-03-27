import { describe, expect, it } from "vitest";

import { DEFAULT_ANTHROPIC_MODEL } from "../src/engine/anthropic.js";
import {
  CODE_PHASE_MODEL_ROUTE,
  HUMAN_SIMULATOR_MODEL_ROUTE,
  PLANNER_MODEL_ROUTE,
  TARGET_ENRICHMENT_MODEL_ROUTE,
  TARGET_MANAGER_PHASE_MODEL_ROUTE,
  createModelAdapterForRoute,
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
    const env = {
      ANTHROPIC_API_KEY: "test-anthropic-key",
      SHIPYARD_ANTHROPIC_MODEL: "claude-default-env",
    } as NodeJS.ProcessEnv;
    const routing = createModelRoutingConfig({
      env,
    });

    expect(
      resolveModelRoute({
        routing,
        routeId: CODE_PHASE_MODEL_ROUTE,
        env,
      }),
    ).toMatchObject({
      routeId: CODE_PHASE_MODEL_ROUTE,
      provider: "anthropic",
      model: "claude-default-env",
    });
  });

  it("lets route-specific overrides win over the global default while inheriting the provider", () => {
    const routing = createModelRoutingConfig({
      defaultRoute: {
        provider: "openai",
        model: "gpt-default",
      },
      routes: {
        [PLANNER_MODEL_ROUTE]: {
          model: "gpt-planner",
        },
      },
    });

    expect(
      resolveModelRoute({
        routing,
        routeId: PLANNER_MODEL_ROUTE,
      }),
    ).toMatchObject({
      provider: "openai",
      model: "gpt-planner",
    });
    expect(
      resolveModelRoute({
        routing,
        routeId: CODE_PHASE_MODEL_ROUTE,
      }),
    ).toMatchObject({
      provider: "openai",
      model: "gpt-default",
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

  it("resolves the default Anthropic provider to a registered adapter with a default model", () => {
    const env = {
      ANTHROPIC_API_KEY: "test-anthropic-key",
    } as NodeJS.ProcessEnv;
    const routing = createModelRoutingConfig({
      defaultRoute: {
        provider: "anthropic",
      },
      env,
    });

    expect(
      resolveModelRoute({
        routing,
        routeId: CODE_PHASE_MODEL_ROUTE,
        env,
      }),
    ).toMatchObject({
      provider: "anthropic",
      model: DEFAULT_ANTHROPIC_MODEL,
    });

    const selection = createModelAdapterForRoute({
      routing,
      routeId: CODE_PHASE_MODEL_ROUTE,
      env,
    });

    expect(selection.modelAdapter.provider).toBe("anthropic");
    expect(selection.model).toBe(DEFAULT_ANTHROPIC_MODEL);
  });

  it("still allows explicit OpenAI route overrides when Anthropic is the default", () => {
    const env = {
      ANTHROPIC_API_KEY: "test-anthropic-key",
      OPENAI_API_KEY: "test-openai-key",
      SHIPYARD_OPENAI_MODEL: "gpt-route",
    } as NodeJS.ProcessEnv;
    const routing = createModelRoutingConfig({
      defaultRoute: {
        provider: "anthropic",
      },
      routes: {
        [PLANNER_MODEL_ROUTE]: {
          provider: "openai",
        },
      },
      env,
    });

    expect(
      resolveModelRoute({
        routing,
        routeId: PLANNER_MODEL_ROUTE,
        env,
      }),
    ).toMatchObject({
      provider: "openai",
      model: "gpt-route",
    });

    const selection = createModelAdapterForRoute({
      routing,
      routeId: PLANNER_MODEL_ROUTE,
      env,
    });

    expect(selection.modelAdapter.provider).toBe("openai");
    expect(selection.model).toBe("gpt-route");
  });

  it("supports a dedicated human simulator route override", () => {
    const routing = createModelRoutingConfig({
      defaultRoute: {
        provider: "openai",
        model: "gpt-default",
      },
      routes: {
        [HUMAN_SIMULATOR_MODEL_ROUTE]: {
          model: "gpt-human-simulator",
        },
      },
    });

    expect(
      resolveModelRoute({
        routing,
        routeId: HUMAN_SIMULATOR_MODEL_ROUTE,
      }),
    ).toMatchObject({
      provider: "openai",
      model: "gpt-human-simulator",
    });
  });
});
