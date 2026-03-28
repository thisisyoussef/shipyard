/**
 * ProductCard — target card for the dashboard grid.
 *
 * UIR-T04 — Dashboard & Product Cards
 */

import { Badge, StatusDot } from "../primitives.js";
import type { BadgeTone } from "../primitives.js";

// ── Types ──────────────────────────────────────

export interface ProductCardData {
  id: string;
  name: string;
  path: string;
  scaffoldType: string;
  status: "ready" | "agent-busy" | "error" | "connecting";
  lastActivity: string;
  starred: boolean;
  previewThumbnail?: string;
}

// ── Helpers ────────────────────────────────────

function statusTone(status: ProductCardData["status"]): BadgeTone {
  switch (status) {
    case "ready":
      return "success";
    case "agent-busy":
      return "accent";
    case "error":
      return "danger";
    case "connecting":
      return "warning";
  }
}

function statusPulse(status: ProductCardData["status"]): boolean {
  return status === "agent-busy" || status === "connecting";
}

function relativeTime(iso: string): string {
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
}

export function ProductCard({ product, onOpen }: ProductCardProps) {
  const initial = product.name.charAt(0).toUpperCase();

  return (
    <button
      type="button"
      className="product-card"
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
          <span className="product-card-initial" aria-hidden="true">
            {initial}
          </span>
        )}
      </div>

      <div className="product-card-info">
        <div className="product-card-title-row">
          <StatusDot
            tone={statusTone(product.status)}
            pulse={statusPulse(product.status)}
          />
          <span className="product-card-name">{product.name}</span>
          {product.starred ? (
            <span className="product-card-star" aria-label="Starred">
              *
            </span>
          ) : null}
        </div>

        <div className="product-card-meta">
          <Badge tone="neutral">{product.scaffoldType}</Badge>
          <span className="product-card-time">{relativeTime(product.lastActivity)}</span>
        </div>
      </div>
    </button>
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
