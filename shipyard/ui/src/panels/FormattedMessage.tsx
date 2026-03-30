import { Fragment, type ReactNode } from "react";

interface FormattedMessageProps {
  text: string;
}

type MessageBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "unordered-list"; items: string[] }
  | { type: "ordered-list"; items: string[] }
  | { type: "blockquote"; text: string }
  | { type: "code"; language: string | null; text: string };

const UNORDERED_LIST_PATTERN = /^\s*[-*•]\s+(.*)$/;
const ORDERED_LIST_PATTERN = /^\s*(\d+)\.\s+(.*)$/;
const HEADING_PATTERN = /^(#{1,6})\s+(.*)$/;
const BLOCKQUOTE_PATTERN = /^>\s?(.*)$/;
const FENCE_PATTERN = /^```([\w-]+)?\s*$/;
const INLINE_PATTERN =
  /(`[^`]+`|\*\*[^*]+?\*\*|\*[^*]+?\*|_[^_]+?_|\[[^\]]+?\]\([^)]+?\))/g;

function isBlockBoundary(line: string): boolean {
  const trimmedLine = line.trim();

  return (
    trimmedLine.length === 0 ||
    FENCE_PATTERN.test(trimmedLine) ||
    HEADING_PATTERN.test(trimmedLine) ||
    BLOCKQUOTE_PATTERN.test(trimmedLine) ||
    UNORDERED_LIST_PATTERN.test(trimmedLine) ||
    ORDERED_LIST_PATTERN.test(trimmedLine)
  );
}

function parseMessageBlocks(text: string): MessageBlock[] {
  const normalizedText = text.replace(/\r\n?/g, "\n").trim();

  if (normalizedText.length === 0) {
    return [{ type: "paragraph", text: "" }];
  }

  const lines = normalizedText.split("\n");
  const blocks: MessageBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const currentLine = lines[index] ?? "";
    const trimmedLine = currentLine.trim();

    if (trimmedLine.length === 0) {
      index += 1;
      continue;
    }

    const fenceMatch = trimmedLine.match(FENCE_PATTERN);
    if (fenceMatch) {
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length) {
        const codeLine = lines[index] ?? "";

        if (FENCE_PATTERN.test(codeLine.trim())) {
          index += 1;
          break;
        }

        codeLines.push(codeLine);
        index += 1;
      }

      blocks.push({
        type: "code",
        language: fenceMatch[1] ?? null,
        text: codeLines.join("\n"),
      });
      continue;
    }

    const headingMatch = trimmedLine.match(HEADING_PATTERN);
    if (headingMatch) {
      const headingPrefix = headingMatch[1] ?? "#";

      blocks.push({
        type: "heading",
        level: Math.min(headingPrefix.length + 1, 6),
        text: headingMatch[2] ?? "",
      });
      index += 1;
      continue;
    }

    if (BLOCKQUOTE_PATTERN.test(trimmedLine)) {
      const quoteLines: string[] = [];

      while (index < lines.length) {
        const quoteLine = lines[index] ?? "";
        const quoteMatch = quoteLine.trim().match(BLOCKQUOTE_PATTERN);

        if (!quoteMatch) {
          break;
        }

        quoteLines.push(quoteMatch[1] ?? "");
        index += 1;
      }

      blocks.push({
        type: "blockquote",
        text: quoteLines.join("\n"),
      });
      continue;
    }

    const unorderedMatch = trimmedLine.match(UNORDERED_LIST_PATTERN);
    if (unorderedMatch) {
      const items: string[] = [];

      while (index < lines.length) {
        const listLine = lines[index] ?? "";
        const listMatch = listLine.match(UNORDERED_LIST_PATTERN);

        if (!listMatch) {
          break;
        }

        const itemLines = [listMatch[1] ?? ""];
        index += 1;

        while (index < lines.length) {
          const continuationLine = lines[index] ?? "";

          if (continuationLine.trim().length === 0 || isBlockBoundary(continuationLine)) {
            break;
          }

          itemLines.push(continuationLine.trim());
          index += 1;
        }

        items.push(itemLines.join("\n"));

        if ((lines[index] ?? "").trim().length === 0) {
          break;
        }
      }

      blocks.push({ type: "unordered-list", items });
      continue;
    }

    const orderedMatch = trimmedLine.match(ORDERED_LIST_PATTERN);
    if (orderedMatch) {
      const items: string[] = [];

      while (index < lines.length) {
        const listLine = lines[index] ?? "";
        const listMatch = listLine.match(ORDERED_LIST_PATTERN);

        if (!listMatch) {
          break;
        }

        const itemLines = [listMatch[2] ?? ""];
        index += 1;

        while (index < lines.length) {
          const continuationLine = lines[index] ?? "";

          if (continuationLine.trim().length === 0 || isBlockBoundary(continuationLine)) {
            break;
          }

          itemLines.push(continuationLine.trim());
          index += 1;
        }

        items.push(itemLines.join("\n"));

        if ((lines[index] ?? "").trim().length === 0) {
          break;
        }
      }

      blocks.push({ type: "ordered-list", items });
      continue;
    }

    const paragraphLines = [currentLine];
    index += 1;

    while (index < lines.length) {
      const paragraphLine = lines[index] ?? "";

      if (paragraphLine.trim().length === 0 || isBlockBoundary(paragraphLine)) {
        break;
      }

      paragraphLines.push(paragraphLine);
      index += 1;
    }

    blocks.push({
      type: "paragraph",
      text: paragraphLines.join("\n"),
    });
  }

  return blocks;
}

function renderInlineText(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let matchIndex = 0;

  for (const match of text.matchAll(INLINE_PATTERN)) {
    const token = match[0];
    const matchStart = match.index ?? 0;

    if (matchStart > lastIndex) {
      nodes.push(text.slice(lastIndex, matchStart));
    }

    if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(
        <code
          key={`${keyPrefix}-code-${String(matchIndex)}`}
          className="chat-rich-inline-code"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(
        <strong key={`${keyPrefix}-strong-${String(matchIndex)}`}>
          {renderInlineText(token.slice(2, -2), `${keyPrefix}-strong-${String(matchIndex)}`)}
        </strong>,
      );
    } else if (
      (token.startsWith("*") && token.endsWith("*")) ||
      (token.startsWith("_") && token.endsWith("_"))
    ) {
      nodes.push(
        <em key={`${keyPrefix}-em-${String(matchIndex)}`}>
          {renderInlineText(token.slice(1, -1), `${keyPrefix}-em-${String(matchIndex)}`)}
        </em>,
      );
    } else if (token.startsWith("[") && token.includes("](") && token.endsWith(")")) {
      const separatorIndex = token.indexOf("](");
      const label = token.slice(1, separatorIndex);
      const url = token.slice(separatorIndex + 2, -1);

      nodes.push(
        <a
          key={`${keyPrefix}-link-${String(matchIndex)}`}
          className="chat-markdown-link"
          href={url}
          target="_blank"
          rel="noreferrer"
        >
          {renderInlineText(label, `${keyPrefix}-link-${String(matchIndex)}`)}
        </a>,
      );
    } else {
      nodes.push(token);
    }

    lastIndex = matchStart + token.length;
    matchIndex += 1;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

function renderInlineTextWithBreaks(text: string, keyPrefix: string): ReactNode {
  const lines = text.split("\n");

  return lines.map((line, index) => (
    <Fragment key={`${keyPrefix}-line-${String(index)}`}>
      {renderInlineText(line, `${keyPrefix}-${String(index)}`)}
      {index < lines.length - 1 ? <br /> : null}
    </Fragment>
  ));
}

function renderHeading(level: number, key: string, content: ReactNode) {
  switch (level) {
    case 2:
      return (
        <h2 key={key} className="chat-rich-heading">
          {content}
        </h2>
      );
    case 3:
      return (
        <h3 key={key} className="chat-rich-heading">
          {content}
        </h3>
      );
    case 4:
      return (
        <h4 key={key} className="chat-rich-heading">
          {content}
        </h4>
      );
    case 5:
      return (
        <h5 key={key} className="chat-rich-heading">
          {content}
        </h5>
      );
    default:
      return (
        <h6 key={key} className="chat-rich-heading">
          {content}
        </h6>
      );
  }
}

export function FormattedMessage({ text }: FormattedMessageProps) {
  const blocks = parseMessageBlocks(text);

  return (
    <div className="chat-formatted-message">
      {blocks.map((block, index) => {
        const key = `block-${String(index)}`;

        switch (block.type) {
          case "heading":
            return renderHeading(
              block.level,
              key,
              renderInlineTextWithBreaks(block.text, key),
            );
          case "unordered-list":
            return (
              <ul key={key} className="chat-rich-list">
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-item-${String(itemIndex)}`} className="chat-rich-list-item">
                    {renderInlineTextWithBreaks(item, `${key}-${String(itemIndex)}`)}
                  </li>
                ))}
              </ul>
            );
          case "ordered-list":
            return (
              <ol key={key} className="chat-rich-list chat-rich-list-ordered">
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-item-${String(itemIndex)}`} className="chat-rich-list-item">
                    {renderInlineTextWithBreaks(item, `${key}-${String(itemIndex)}`)}
                  </li>
                ))}
              </ol>
            );
          case "blockquote":
            return (
              <blockquote key={key} className="chat-rich-quote">
                {renderInlineTextWithBreaks(block.text, key)}
              </blockquote>
            );
          case "code":
            return (
              <pre key={key} className="chat-rich-pre">
                <code data-language={block.language ?? undefined}>{block.text}</code>
              </pre>
            );
          case "paragraph":
          default:
            return (
              <p key={key} className="chat-rich-paragraph">
                {renderInlineTextWithBreaks(block.text, key)}
              </p>
            );
        }
      })}
    </div>
  );
}
