/**
 * Preview Harness — Standalone app that renders all three views
 * with a simple tab switcher using mock data.
 *
 * Open via /preview.html on the Vite dev server.
 */

import { useCallback } from "react";
import { NavBar } from "./shell/index.js";
import { UltimateBadge } from "./shell/index.js";
import { DashboardView, EditorView, KanbanView } from "./views/index.js";
import { useRouter } from "./use-router.js";
import type { Route } from "./router.js";
import type { TargetManagerViewModel } from "./view-models.js";

// ── Mock Data ──────────────────────────────────

const MOCK_TARGET_MANAGER: TargetManagerViewModel = {
  currentTarget: {
    name: "Craft Your Vision",
    path: "/projects/craft-vision",
    language: "TypeScript",
    framework: "React",
    hasProfile: true,
    description: "AI-powered design tool",
  },
  availableTargets: [
    {
      name: "Craft Your Vision",
      path: "/projects/craft-vision",
      language: "TypeScript",
      framework: "React",
      description: "AI-powered design tool",
      hasProfile: true,
    },
    {
      name: "Papyr Connect",
      path: "/projects/papyr-connect",
      language: "TypeScript",
      framework: "Next.js",
      description: "Business networking platform",
      hasProfile: true,
    },
    {
      name: "Papyr Apparel Studio",
      path: "/projects/papyr-apparel",
      language: "TypeScript",
      framework: "React",
      description: "Production-first apparel partner",
      hasProfile: false,
    },
    {
      name: "Beez Freeze Quick Order",
      path: "/projects/beez-freeze",
      language: "TypeScript",
      framework: "React",
      description: "Fresh drinks ordering app",
      hasProfile: false,
    },
    {
      name: "Al Amanah Redesign",
      path: "/projects/al-amanah",
      language: "TypeScript",
      framework: "React",
      description: "Transport company website",
      hasProfile: true,
    },
  ],
  enrichmentStatus: { status: "complete", message: "Ready" },
};

// ── Component ──────────────────────────────────

export function PreviewHarness() {
  const { route, navigate } = useRouter();

  const handleNavigate = useCallback(
    (next: Route) => {
      navigate(next);
    },
    [navigate],
  );

  const handleCreateProduct = useCallback(
    (input: {
      name: string;
      description: string;
      scaffoldType: "react-ts" | "express-ts" | "python" | "go" | "empty";
    }) => {
      // eslint-disable-next-line no-console
      console.log("[PreviewHarness] createProduct", input);
    },
    [],
  );

  const handleSubmitHeroPrompt = useCallback((prompt: string) => {
    // eslint-disable-next-line no-console
    console.log("[PreviewHarness] heroPrompt", prompt);
  }, []);

  const handleUltimateClick = useCallback(() => {
    // eslint-disable-next-line no-console
    console.log("[PreviewHarness] ultimate click");
  }, []);

  // ── View dispatch ──────────────────────────────

  let view: React.ReactNode;

  switch (route.view) {
    case "editor":
      view = (
        <EditorView
          productId={route.productId}
          productName="Craft Your Vision"
          scaffoldType="react-ts"
          onNavigate={handleNavigate}
        />
      );
      break;
    case "board":
      view = <KanbanView />;
      break;
    case "human-feedback":
      view = <div style={{ padding: "2rem", color: "var(--c-text-secondary, #888)" }}>Human Feedback view (not included in preview harness)</div>;
      break;
    case "dashboard":
    default:
      view = (
        <DashboardView
          targetManager={MOCK_TARGET_MANAGER}
          onNavigate={handleNavigate}
          onCreateProduct={handleCreateProduct}
          onSubmitHeroPrompt={handleSubmitHeroPrompt}
        />
      );
      break;
  }

  return (
    <div className="preview-harness">
      <NavBar
        currentView={route.view}
        onNavigate={handleNavigate}
        ultimateActive={true}
        onUltimateClick={handleUltimateClick}
      />
      <UltimateBadge
        active={true}
        turnCount={7}
        currentBrief="Build a landing page"
        onSendFeedback={(text) => {
          // eslint-disable-next-line no-console
          console.log("[PreviewHarness] ultimateFeedback", text);
        }}
        onStop={() => {
          // eslint-disable-next-line no-console
          console.log("[PreviewHarness] ultimate stop");
        }}
      />
      <main style={{ flex: 1, overflow: "auto" }}>{view}</main>
    </div>
  );
}
