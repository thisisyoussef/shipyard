import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

interface ScaffoldPreviewTargetOptions {
  targetDirectory: string;
  name?: string;
  version?: string;
  mode?: "healthy" | "exit-after-ready" | "fail-start";
  installViteStub?: boolean;
}

const HEALTHY_PREVIEW_SERVER = `import { createServer } from "node:http";

const args = process.argv.slice(2);

function readFlag(name, fallback) {
  const index = args.indexOf(name);

  if (index === -1) {
    return fallback;
  }

  return args[index + 1] ?? fallback;
}

const host = readFlag("--host", "127.0.0.1");
const port = Number.parseInt(readFlag("--port", "4173"), 10);
const title = process.env.SHIPYARD_PREVIEW_TITLE ?? "Preview Ready";
const server = createServer((request, response) => {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
  });
  response.end(\`<!doctype html><html><body><h1>\${title}</h1><p>\${host}:\${port}</p></body></html>\`);
});

server.listen(port, host, () => {
  console.log("VITE v5.0.8 ready in 145 ms");
  console.log(\`Local: http://\${host}:\${port}/\`);
});

function shutdown() {
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
`;

const EXITING_PREVIEW_SERVER = `${HEALTHY_PREVIEW_SERVER}
setTimeout(() => {
  server.close(() => {
    process.exit(0);
  });
}, 150);
`;

const FAILING_PREVIEW_SERVER = `console.error("Preview boot failed before the server became healthy.");
process.exit(1);
`;

function createViteStubContents(entryFileName: string): string {
  return `#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";

const entryPath = path.join(process.cwd(), ${JSON.stringify(entryFileName)});
const child = spawn(process.execPath, [entryPath, ...process.argv.slice(2)], {
  stdio: "inherit",
});

child.on("close", (code) => {
  process.exit(code ?? 0);
});
`;
}

export async function scaffoldPreviewableTarget(
  options: ScaffoldPreviewTargetOptions,
): Promise<void> {
  const mode = options.mode ?? "healthy";
  const previewEntryFileName =
    mode === "exit-after-ready"
      ? "preview-exit.mjs"
      : mode === "fail-start"
        ? "preview-fail.mjs"
        : "preview-server.mjs";

  await writeFile(
    path.join(options.targetDirectory, "package.json"),
    JSON.stringify(
      {
        name: options.name ?? "previewable-target",
        version: options.version ?? "1.0.0",
        scripts: {
          dev: "vite",
          build: "vite build",
        },
        dependencies: {
          vite: "^8.0.0",
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  await writeFile(
    path.join(options.targetDirectory, previewEntryFileName),
    mode === "exit-after-ready"
      ? EXITING_PREVIEW_SERVER
      : mode === "fail-start"
        ? FAILING_PREVIEW_SERVER
      : HEALTHY_PREVIEW_SERVER,
    "utf8",
  );

  if (options.installViteStub === false) {
    return;
  }

  const viteBinDirectory = path.join(
    options.targetDirectory,
    "node_modules",
    ".bin",
  );

  await mkdir(viteBinDirectory, { recursive: true });

  const viteBinPath = path.join(viteBinDirectory, "vite");
  await writeFile(viteBinPath, createViteStubContents(previewEntryFileName), "utf8");
  await chmod(viteBinPath, 0o755);
}
