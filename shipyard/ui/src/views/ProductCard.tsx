/**
 * ProductCard — target card for the dashboard grid.
 *
 * UIR-T04 — Dashboard & Product Cards
 */

import type { DashboardCardStatus, DashboardCardViewModel } from "../dashboard-catalog.js";
import { Badge, StatusDot } from "../primitives.js";
import type { BadgeTone } from "../primitives.js";

// ── Types ──────────────────────────────────────

export type ProductCardData = DashboardCardViewModel;

// ── Helpers ────────────────────────────────────

function statusTone(status: DashboardCardStatus): BadgeTone {
  switch (status) {
    case "ready":
      return "success";
    case "agent-busy":
      return "accent";
    case "error":
      return "danger";
    case "connecting":
      return "warning";
    case "available":
      return "neutral";
  }
}

function statusPulse(status: DashboardCardStatus): boolean {
  return status === "agent-busy" || status === "connecting";
}

function relativeTime(iso: string | null): string {
  if (!iso) {
    return "Never opened";
  }

  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)}h ago`;

  const days = Math.floor(hours / 24);
  return `${String(days)}d ago`;
}

// ── ProductCard ────────────────────────────────

interface ProductCardProps {
  product: ProductCardData;
  onOpen: (productId: string) => void;
  onToggleStar: (productId: string) => void;
}

export function ProductCard({
  product,
  onOpen,
  onToggleStar,
}: ProductCardProps) {
  const initial = product.name.charAt(0).toUpperCase();
  const stackTone = product.stackLabel === "Unknown stack" ? "warning" : "neutral";

  return (
    <article
      className="product-card"
      data-active={product.active}
      data-open={product.open}
    >
      <div className="product-card-toolbar">
        <Badge tone={statusTone(product.status)} className="product-card-status">
          <StatusDot
            tone={statusTone(product.status)}
            pulse={statusPulse(product.status)}
          />
          {product.statusLabel}
        </Badge>
        <button
          type="button"
          className="product-card-star-toggle"
          aria-label={`${product.starred ? "Remove star from" : "Star"} ${product.name}`}
          aria-pressed={product.starred}
          onClick={() => onToggleStar(product.id)}
        >
          {product.starred ? "Starred" : "Star"}
        </button>
      </div>

      <button
        type="button"
        className="product-card-open"
        onClick={() => onOpen(product.id)}
        aria-label={`Open ${product.name}`}
      >
        <div className="product-card-preview">
          {product.previewThumbnail ? (
            <img
              src={product.previewThumbnail}
              alt={`${product.name} preview`}
              className="product-card-thumbnail"
            />
          ) : (
            <div className="product-card-preview-copy">
              <span className="product-card-initial" aria-hidden="true">
                {initial}
              </span>
              <div className="product-card-preview-text">
                <span className="product-card-preview-label">
                  {product.previewLabel}
                </span>
                <span className="product-card-preview-detail">
                  {product.previewDetail}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="product-card-info">
          <div className="product-card-title-row">
            <span className="product-card-name">{product.name}</span>
          </div>

          <p className="product-card-description">
            {product.description ?? product.previewDetail}
          </p>

          <div className="product-card-meta">
            <Badge tone={stackTone}>{product.stackLabel}</Badge>
            <span className="product-card-time">
              {relativeTime(product.lastActivity)}
            </span>
          </div>
        </div>
      </button>
    </article>
  );
}

// ── NewProductCard ─────────────────────────────

interface NewProductCardProps {
  onCreateNew: () => void;
}

export function NewProductCard({ onCreateNew }: NewProductCardProps) {
  return (
    <button
      type="button"
      className="product-card product-card--new"
      onClick={onCreateNew}
      aria-label="Create new product"
    >
      <div className="product-card-preview product-card-preview--new">
        <span className="product-card-plus" aria-hidden="true">
          +
        </span>
      </div>
      <div className="product-card-info">
        <span className="product-card-name">New product</span>
      </div>
    </button>
  );
}
