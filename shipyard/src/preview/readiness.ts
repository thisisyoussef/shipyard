export interface ReadyServerEvidence {
  readyLine: string | null;
  readyUrl: string | null;
}

const LOOPBACK_URL_PATTERN =
  /https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]|::1):\d+\/?/i;

export function normalizeLoopbackUrlHost(url: string, host: string): string {
  return url.replace(
    /https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]|::1):/i,
    `http://${host}:`,
  );
}

export function extractLoopbackUrl(line: string): string | null {
  const match = line.match(LOOPBACK_URL_PATTERN);
  return match?.[0] ?? null;
}

export function isReadyServerLine(line: string): boolean {
  return /\bready in\b/i.test(line) || /\blocal:\s*https?:\/\//i.test(line);
}

export function findReadyServerEvidence(output: string): ReadyServerEvidence | null {
  let readyLine: string | null = null;
  let readyUrl: string | null = null;

  for (const rawLine of output.split(/\r?\n/g)) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    if (!readyUrl) {
      readyUrl = extractLoopbackUrl(line);
    }

    if (!readyLine && isReadyServerLine(line)) {
      readyLine = line;
    }

    if (readyLine && readyUrl) {
      break;
    }
  }

  if (!readyLine && !readyUrl) {
    return null;
  }

  return {
    readyLine,
    readyUrl,
  };
}
