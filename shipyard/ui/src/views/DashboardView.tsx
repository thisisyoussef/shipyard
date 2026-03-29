/**
 * DashboardView — main landing page.
 *
 * UIR-T04 — Dashboard & Product Cards
 */

import type { KeyboardEvent, FormEvent } from "react";
import type { DashboardCardViewModel } from "../dashboard-catalog.js";
import type { DashboardTabId } from "../dashboard-preferences.js";
import type { BadgeTone } from "../primitives.js";
import { ProductCard, NewProductCard } from "./ProductCard.js";

// ── Types ──────────────────────────────────────

export interface DashboardViewNotice {
  tone: BadgeTone;
  title: string;
  detail: string;
}

interface DashboardViewProps {
  heroPrompt: string;
  heroBusy: boolean;
  activeTab: DashboardTabId;
  cards: DashboardCardViewModel[];
  emptyState: {
    title: string;
    detail: string;
  } | null;
  notice: DashboardViewNotice | null;
  onHeroPromptChange: (value: string) => void;
  onSubmitHeroPrompt: (prompt: string) => void;
  onSelectTab: (tab: DashboardTabId) => void;
  onOpenProduct: (productId: string) => void;
  onToggleStar: (productId: string) => void;
  onCreateProduct: () => void;
}

// ── Tabs ───────────────────────────────────────

const TABS: { id: DashboardTabId; label: string }[] = [
  { id: "my-products", label: "My products" },
  { id: "recent", label: "Recent" },
  { id: "starred", label: "Starred" },
];

// ── Component ──────────────────────────────────

export function DashboardView({
  heroPrompt,
  heroBusy,
  activeTab,
  cards,
  emptyState,
  notice,
  onHeroPromptChange,
  onSubmitHeroPrompt,
  onSelectTab,
  onOpenProduct,
  onToggleStar,
  onCreateProduct,
}: DashboardViewProps) {
  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    const trimmed = heroPrompt.trim();
    if (!trimmed || heroBusy) return;
    onSubmitHeroPrompt(trimmed);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      const trimmed = heroPrompt.trim();
      if (!trimmed || heroBusy) return;
      onSubmitHeroPrompt(trimmed);
    }
  }

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
            onChange={(event) => onHeroPromptChange(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            disabled={heroBusy}
          />
          <button
            type="submit"
            className="dashboard-hero-submit"
            disabled={heroPrompt.trim().length === 0 || heroBusy}
            aria-label="Submit prompt"
          >
            <span aria-hidden="true">&rarr;</span>
          </button>
        </form>
      </section>

      {notice ? (
        <div
          className="surface-card dashboard-notice"
          data-tone={notice.tone}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <strong>{notice.title}</strong>
          <p>{notice.detail}</p>
        </div>
      ) : null}

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
            onClick={() => onSelectTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Product grid */}
      {cards.length === 0 ? (
        <div className="dashboard-empty">
          <h2>{emptyState?.title ?? "No products yet"}</h2>
          <p>
            {emptyState?.detail ??
              "Create a product to give Shipyard a live workspace."}
          </p>
          {activeTab === "my-products" ? (
            <NewProductCard onCreateNew={onCreateProduct} />
          ) : null}
        </div>
      ) : (
        <div className="dashboard-grid">
          {cards.map((card) => (
            <ProductCard
              key={card.id}
              product={card}
              onOpen={onOpenProduct}
              onToggleStar={onToggleStar}
            />
          ))}
          {activeTab === "my-products" ? (
            <NewProductCard onCreateNew={onCreateProduct} />
          ) : null}
        </div>
      )}
    </div>
  );
}
