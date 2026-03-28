/**
 * DashboardView — main landing page.
 *
 * UIR-T04 — Dashboard & Product Cards
 */

import { useState, useCallback } from "react";
import type { KeyboardEvent, FormEvent } from "react";
import type { Route } from "../router.js";
import type { TargetManagerViewModel } from "../view-models.js";
import { ProductCard, NewProductCard } from "./ProductCard.js";
import type { ProductCardData } from "./ProductCard.js";

// ── Types ──────────────────────────────────────

type TabId = "my-products" | "recent" | "starred";

interface DashboardViewProps {
  targetManager: TargetManagerViewModel | null;
  onNavigate: (route: Route) => void;
  onCreateProduct: (input: {
    name: string;
    description: string;
    scaffoldType: "react-ts" | "express-ts" | "python" | "go" | "empty";
  }) => void;
  onSubmitHeroPrompt: (prompt: string) => void;
}

// ── Helpers ────────────────────────────────────

function mapTargetsToCards(
  targetManager: TargetManagerViewModel | null,
): ProductCardData[] {
  if (!targetManager) return [];

  return targetManager.availableTargets.map((target) => ({
    id: target.path,
    name: target.name,
    path: target.path,
    scaffoldType: target.framework ?? target.language ?? "unknown",
    status: "ready" as const,
    lastActivity: new Date().toISOString(),
    starred: false,
  }));
}

function filterCards(cards: ProductCardData[], tab: TabId): ProductCardData[] {
  switch (tab) {
    case "starred":
      return cards.filter((c) => c.starred);
    case "recent":
      return [...cards].sort(
        (a, b) =>
          new Date(b.lastActivity).getTime() -
          new Date(a.lastActivity).getTime(),
      );
    case "my-products":
    default:
      return cards;
  }
}

// ── Tabs ───────────────────────────────────────

const TABS: { id: TabId; label: string }[] = [
  { id: "my-products", label: "My products" },
  { id: "recent", label: "Recent" },
  { id: "starred", label: "Starred" },
];

// ── Component ──────────────────────────────────

export function DashboardView({
  targetManager,
  onNavigate,
  onCreateProduct,
  onSubmitHeroPrompt,
}: DashboardViewProps) {
  const [heroPrompt, setHeroPrompt] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("my-products");

  const allCards = mapTargetsToCards(targetManager);
  const visibleCards = filterCards(allCards, activeTab);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const trimmed = heroPrompt.trim();
      if (!trimmed) return;
      onSubmitHeroPrompt(trimmed);
      setHeroPrompt("");
    },
    [heroPrompt, onSubmitHeroPrompt],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        const trimmed = heroPrompt.trim();
        if (!trimmed) return;
        onSubmitHeroPrompt(trimmed);
        setHeroPrompt("");
      }
    },
    [heroPrompt, onSubmitHeroPrompt],
  );

  const handleOpenProduct = useCallback(
    (productId: string) => {
      onNavigate({ view: "editor", productId });
    },
    [onNavigate],
  );

  const handleCreateNew = useCallback(() => {
    onCreateProduct({
      name: "New Project",
      description: "",
      scaffoldType: "empty",
    });
  }, [onCreateProduct]);

  return (
    <div className="dashboard">
      {/* Hero */}
      <section className="dashboard-hero">
        <h1 className="dashboard-hero-heading">
          What are you building today?
        </h1>
        <form className="dashboard-hero-form" onSubmit={handleSubmit}>
          <textarea
            className="dashboard-hero-input"
            placeholder="Describe what you want to build..."
            value={heroPrompt}
            onChange={(e) => setHeroPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
          />
          <button
            type="submit"
            className="dashboard-hero-submit"
            disabled={heroPrompt.trim().length === 0}
            aria-label="Submit prompt"
          >
            <span aria-hidden="true">&rarr;</span>
          </button>
        </form>
      </section>

      {/* Tab bar */}
      <nav className="dashboard-tabs" role="tablist" aria-label="Product filter">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className="dashboard-tab"
            aria-selected={activeTab === tab.id}
            data-active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Product grid */}
      {visibleCards.length === 0 && activeTab !== "my-products" ? (
        <div className="dashboard-empty">
          <p>No products match this filter.</p>
        </div>
      ) : visibleCards.length === 0 ? (
        <div className="dashboard-empty">
          <p>No products yet. Create one to get started.</p>
          <NewProductCard onCreateNew={handleCreateNew} />
        </div>
      ) : (
        <div className="dashboard-grid">
          {visibleCards.map((card) => (
            <ProductCard
              key={card.id}
              product={card}
              onOpen={handleOpenProduct}
            />
          ))}
          <NewProductCard onCreateNew={handleCreateNew} />
        </div>
      )}
    </div>
  );
}
