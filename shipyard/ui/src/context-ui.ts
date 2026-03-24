export const CONTEXT_PREVIEW_LIMIT = 220;
export const DEFAULT_VISIBLE_CONTEXT_RECEIPTS = 3;

export interface TextPreview {
  text: string;
  isTruncated: boolean;
  hiddenCharacterCount: number;
}

export function validateContextDraft(contextDraft: string): string | null {
  if (!contextDraft.length) {
    return null;
  }

  if (!contextDraft.trim()) {
    return "Context note only contains whitespace. Add text or clear it before submitting.";
  }

  return null;
}

export function buildTextPreview(
  text: string,
  expanded: boolean,
  limit = CONTEXT_PREVIEW_LIMIT,
): TextPreview {
  if (expanded || text.length <= limit) {
    return {
      text,
      isTruncated: false,
      hiddenCharacterCount: 0,
    };
  }

  return {
    text: `${text.slice(0, limit).trimEnd()}…`,
    isTruncated: true,
    hiddenCharacterCount: text.length - limit,
  };
}
