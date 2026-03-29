import type { HostingViewModel } from "./view-models.js";

export type PreviewSurfaceSource =
  | "private-preview"
  | "public-deploy"
  | "none";

export interface ResolvedPreviewSurface {
  source: PreviewSurfaceSource;
  previewUrl: string | null;
  previewLabel: string | null;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function normalizePreviewUrl(
  url: string | null | undefined,
): string | null {
  const trimmed = url?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export function isLoopbackPreviewUrl(
  url: string | null | undefined,
): boolean {
  const normalizedUrl = normalizePreviewUrl(url);

  if (!normalizedUrl) {
    return false;
  }

  try {
    return LOOPBACK_HOSTS.has(new URL(normalizedUrl).hostname);
  } catch {
    return /https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]|::1):/iu.test(
      normalizedUrl,
    );
  }
}

export function resolvePreviewSurface(options: {
  privatePreviewUrl?: string | null;
  publicDeploymentUrl?: string | null;
  hosting?: Pick<HostingViewModel, "active"> | null;
}): ResolvedPreviewSurface {
  const privatePreviewUrl = normalizePreviewUrl(options.privatePreviewUrl);
  const publicDeploymentUrl = normalizePreviewUrl(options.publicDeploymentUrl);
  const hosted = Boolean(options.hosting?.active);

  if (hosted) {
    if (publicDeploymentUrl) {
      return {
        source: "public-deploy",
        previewUrl: publicDeploymentUrl,
        previewLabel: "Production deploy",
      };
    }

    if (privatePreviewUrl && !isLoopbackPreviewUrl(privatePreviewUrl)) {
      return {
        source: "private-preview",
        previewUrl: privatePreviewUrl,
        previewLabel: "Live preview",
      };
    }

    return {
      source: "none",
      previewUrl: null,
      previewLabel: null,
    };
  }

  if (privatePreviewUrl) {
    return {
      source: "private-preview",
      previewUrl: privatePreviewUrl,
      previewLabel: "Live preview",
    };
  }

  if (publicDeploymentUrl) {
    return {
      source: "public-deploy",
      previewUrl: publicDeploymentUrl,
      previewLabel: "Production deploy",
    };
  }

  return {
    source: "none",
    previewUrl: null,
    previewLabel: null,
  };
}
