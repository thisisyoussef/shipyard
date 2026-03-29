import { describe, expect, it } from "vitest";

import {
  resolveDashboardSystemNotice,
} from "../ui/src/dashboard-system-notice.js";

describe("dashboard system notice", () => {
  it("surfaces a stale-catalog warning while disconnected", () => {
    expect(
      resolveDashboardSystemNotice({
        connectionState: "disconnected",
        hasLoadedCatalog: true,
      }),
    ).toEqual({
      tone: "warning",
      title: "Showing the last synced product catalog",
      detail:
        "You can browse recent products, but opening or scaffolding products will wait until the browser runtime reconnects.",
    });
  });

  it("stays quiet during the initial cold connect before the catalog has loaded", () => {
    expect(
      resolveDashboardSystemNotice({
        connectionState: "connecting",
        hasLoadedCatalog: false,
      }),
    ).toBeNull();
  });
});
