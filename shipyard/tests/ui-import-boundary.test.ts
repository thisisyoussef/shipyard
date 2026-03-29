import { afterEach, describe, expect, it, vi } from "vitest";

describe("ui import boundary", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../src/agents/profiles.js");
    vi.doUnmock("../src/engine/model-routing.js");
  });

  it("loads client view models without pulling server-only routing or agent profile modules", async () => {
    vi.doMock("../src/agents/profiles.js", () => {
      throw new Error(
        "client view-model imports must not evaluate full agent profiles",
      );
    });
    vi.doMock("../src/engine/model-routing.js", () => {
      throw new Error(
        "client view-model imports must not evaluate server-side model routing",
      );
    });

    const viewModels = await import("../ui/src/view-models.js");

    expect(viewModels.createInitialWorkbenchState).toBeTypeOf("function");
    expect(viewModels.applyBackendMessage).toBeTypeOf("function");
  });
});
