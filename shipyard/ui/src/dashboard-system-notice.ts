import type { DashboardViewNotice } from "./views/DashboardView.js";
import type { WorkbenchConnectionState } from "./view-models.js";

interface ResolveDashboardSystemNoticeOptions {
  connectionState: WorkbenchConnectionState;
  hasLoadedCatalog: boolean;
}

export function resolveDashboardSystemNotice(
  options: ResolveDashboardSystemNoticeOptions,
): DashboardViewNotice | null {
  switch (options.connectionState) {
    case "connecting":
      return options.hasLoadedCatalog
        ? {
          tone: "accent",
          title: "Reconnecting to live workspace state",
          detail:
            "Shipyard is refreshing the product catalog. The dashboard is showing the last synced target list until the browser session reconnects.",
        }
        : null;
    case "disconnected":
      return {
        tone: "warning",
        title: options.hasLoadedCatalog
          ? "Showing the last synced product catalog"
          : "Product catalog unavailable while disconnected",
        detail: options.hasLoadedCatalog
          ? "You can browse recent products, but opening or scaffolding products will wait until the browser runtime reconnects."
          : "Shipyard disconnected before the product catalog finished loading. Reconnect to sync targets and open products again.",
      };
    case "error":
      return {
        tone: "danger",
        title: "Dashboard updates paused after a connection error",
        detail:
          "Dashboard data may be stale until Shipyard restores the browser runtime connection.",
      };
    default:
      return null;
  }
}
