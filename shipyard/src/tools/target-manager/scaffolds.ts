export const SCAFFOLD_TYPES = [
  "ts-pnpm-workspace",
  "react-ts",
  "express-ts",
  "python",
  "go",
  "empty",
] as const;

export type ScaffoldType = (typeof SCAFFOLD_TYPES)[number];

export interface ScaffoldFile {
  path: string;
  content: string;
}

const PNPM_VERSION = "10.33.0";
const REACT_VERSION = "^19.2.4";
const REACT_TYPES_VERSION = "^19.2.14";
const REACT_DOM_TYPES_VERSION = "^19.2.3";
const VITE_PLUGIN_REACT_VERSION = "^6.0.1";
const VITE_VERSION = "^8.0.2";
const TYPESCRIPT_VERSION = "^6.0.2";
const TSX_VERSION = "^4.21.0";
const EXPRESS_VERSION = "^5.1.0";
const EXPRESS_TYPES_VERSION = "^5.0.3";

function formatJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function toDisplayName(name: string): string {
  return name
    .split(/[-_]/u)
    .filter(Boolean)
    .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
    .join(" ");
}

function createReadme(name: string, description: string): string {
  return `# ${toDisplayName(name)}

${description}

## Getting Started

- Keep the initial scope narrow.
- Capture project-specific rules in AGENTS.md as the codebase evolves.
`;
}

function createAgentsFile(name: string, description: string): string {
  return `# ${toDisplayName(name)} Agent Notes

Project description:
- ${description}

Working rules:
- Prefer small, verifiable changes.
- Read existing files before editing them.
- Keep commands and documentation up to date as the project evolves.
`;
}

function createWorkspaceReadme(name: string, description: string): string {
  return `# ${toDisplayName(name)}

${description}

## Workspace Layout

- \`apps/web\`: React + Vite frontend
- \`apps/api\`: Express API
- \`packages/shared\`: shared TypeScript helpers and constants

## Getting Started

1. Run \`pnpm install\`.
2. Run \`pnpm dev:web\` for the frontend.
3. Run \`pnpm dev:api\` for the API.
`;
}

function createWorkspaceAgentsFile(name: string, description: string): string {
  return `# ${toDisplayName(name)} Agent Notes

Project description:
- ${description}

Workspace layout:
- \`apps/web\` owns the browser application.
- \`apps/api\` owns the HTTP API.
- \`packages/shared\` owns shared TypeScript constants and helpers.

Working rules:
- Prefer small, verifiable changes.
- Keep package boundaries clear before extracting shared code.
- Update workspace scripts and docs together when structure changes.
`;
}

function createBaseFiles(name: string, description: string): ScaffoldFile[] {
  return [
    {
      path: "README.md",
      content: createReadme(name, description),
    },
    {
      path: "AGENTS.md",
      content: createAgentsFile(name, description),
    },
  ];
}

function createWorkspaceScope(name: string): string {
  return `@${name}`;
}

function createTsPnpmWorkspaceScaffold(
  name: string,
  description: string,
): ScaffoldFile[] {
  const scope = createWorkspaceScope(name);
  const displayName = toDisplayName(name);

  return [
    {
      path: "README.md",
      content: createWorkspaceReadme(name, description),
    },
    {
      path: "AGENTS.md",
      content: createWorkspaceAgentsFile(name, description),
    },
    {
      path: ".gitignore",
      content: `node_modules
dist
.vite
coverage
.shipyard
*.tsbuildinfo
.env
`,
    },
    {
      path: "package.json",
      content: formatJson({
        name,
        private: true,
        version: "0.1.0",
        packageManager: `pnpm@${PNPM_VERSION}`,
        scripts: {
          dev: `pnpm --filter ${scope}/web dev`,
          "dev:web": `pnpm --filter ${scope}/web dev`,
          "dev:api": `pnpm --filter ${scope}/api dev`,
          build:
            `pnpm --filter ${scope}/shared build && ` +
            `pnpm --filter ${scope}/api build && ` +
            `pnpm --filter ${scope}/web build`,
          typecheck:
            `pnpm --filter ${scope}/shared typecheck && ` +
            `pnpm --filter ${scope}/api typecheck && ` +
            `pnpm --filter ${scope}/web typecheck`,
        },
      }),
    },
    {
      path: "pnpm-workspace.yaml",
      content: `packages:
  - apps/*
  - packages/*
`,
    },
    {
      path: "tsconfig.base.json",
      content: formatJson({
        compilerOptions: {
          target: "ES2022",
          strict: true,
          noUncheckedIndexedAccess: true,
          noImplicitReturns: true,
          noFallthroughCasesInSwitch: true,
          forceConsistentCasingInFileNames: true,
          skipLibCheck: true,
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          resolveJsonModule: true,
        },
      }),
    },
    {
      path: "tsconfig.json",
      content: formatJson({
        extends: "./tsconfig.base.json",
        compilerOptions: {
          noEmit: true,
        },
        files: [],
      }),
    },
    {
      path: "apps/web/package.json",
      content: formatJson({
        name: `${scope}/web`,
        private: true,
        version: "0.1.0",
        type: "module",
        scripts: {
          dev: "vite",
          build: "tsc -p tsconfig.json && vite build",
          preview: "vite preview",
          typecheck: "tsc -p tsconfig.json --pretty false",
        },
        dependencies: {
          [`${scope}/shared`]: "workspace:*",
          react: REACT_VERSION,
          "react-dom": REACT_VERSION,
        },
        devDependencies: {
          "@types/react": REACT_TYPES_VERSION,
          "@types/react-dom": REACT_DOM_TYPES_VERSION,
          "@vitejs/plugin-react": VITE_PLUGIN_REACT_VERSION,
          typescript: TYPESCRIPT_VERSION,
          vite: VITE_VERSION,
        },
      }),
    },
    {
      path: "apps/web/tsconfig.json",
      content: formatJson({
        extends: "../../tsconfig.base.json",
        compilerOptions: {
          jsx: "react-jsx",
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          module: "ESNext",
          moduleResolution: "Bundler",
          noEmit: true,
          types: ["vite/client"],
        },
        include: ["src", "vite.config.ts"],
      }),
    },
    {
      path: "apps/web/vite.config.ts",
      content: `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
`,
    },
    {
      path: "apps/web/index.html",
      content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${displayName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    },
    {
      path: "apps/web/src/main.tsx",
      content: `import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`,
    },
    {
      path: "apps/web/src/App.tsx",
      content: `export function App() {
  return (
    <main>
      <h1>${displayName}</h1>
      <p>${description}</p>
      <ul>
        <li>Frontend lives in <code>apps/web</code>.</li>
        <li>API lives in <code>apps/api</code>.</li>
        <li>Shared helpers can live in <code>packages/shared</code>.</li>
      </ul>
    </main>
  );
}
`,
    },
    {
      path: "apps/api/package.json",
      content: formatJson({
        name: `${scope}/api`,
        private: true,
        version: "0.1.0",
        type: "module",
        scripts: {
          dev: "tsx watch src/index.ts",
          build: "tsc -p tsconfig.json",
          start: "node dist/index.js",
          typecheck: "tsc -p tsconfig.json --noEmit --pretty false",
        },
        dependencies: {
          [`${scope}/shared`]: "workspace:*",
          express: EXPRESS_VERSION,
        },
        devDependencies: {
          "@types/express": EXPRESS_TYPES_VERSION,
          typescript: TYPESCRIPT_VERSION,
          tsx: TSX_VERSION,
        },
      }),
    },
    {
      path: "apps/api/tsconfig.json",
      content: formatJson({
        extends: "../../tsconfig.base.json",
        compilerOptions: {
          module: "NodeNext",
          moduleResolution: "NodeNext",
          outDir: "dist",
          rootDir: "src",
          types: ["node"],
        },
        include: ["src/**/*.ts"],
      }),
    },
    {
      path: "apps/api/src/index.ts",
      content: `import express from "express";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.get("/api/health", (_request, response) => {
  response.json({
    name: "${name}",
    status: "ok",
    message: "API routes are ready under /api.",
  });
});

app.listen(port, () => {
  console.log("API listening on", port);
});
`,
    },
    {
      path: "packages/shared/package.json",
      content: formatJson({
        name: `${scope}/shared`,
        private: true,
        version: "0.1.0",
        type: "module",
        exports: {
          ".": "./src/index.ts",
        },
        scripts: {
          build: "tsc -p tsconfig.json",
          typecheck: "tsc -p tsconfig.json --noEmit --pretty false",
        },
        devDependencies: {
          typescript: TYPESCRIPT_VERSION,
        },
      }),
    },
    {
      path: "packages/shared/tsconfig.json",
      content: formatJson({
        extends: "../../tsconfig.base.json",
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "Bundler",
          rootDir: "src",
          outDir: "dist",
          declaration: true,
        },
        include: ["src/**/*.ts"],
      }),
    },
    {
      path: "packages/shared/src/index.ts",
      content: `export const workspaceName = "${displayName}";
export const apiReadyMessage = "API routes are ready under /api.";
`,
    },
  ];
}

function createReactTsScaffold(
  name: string,
  description: string,
): ScaffoldFile[] {
  return [
    ...createBaseFiles(name, description),
    {
      path: "package.json",
      content: formatJson({
        name,
        private: true,
        version: "0.1.0",
        type: "module",
        scripts: {
          dev: "vite",
          build: "tsc -b && vite build",
          preview: "vite preview",
        },
        dependencies: {
          react: REACT_VERSION,
          "react-dom": REACT_VERSION,
        },
        devDependencies: {
          "@types/react": REACT_TYPES_VERSION,
          "@types/react-dom": REACT_DOM_TYPES_VERSION,
          "@vitejs/plugin-react": VITE_PLUGIN_REACT_VERSION,
          typescript: TYPESCRIPT_VERSION,
          vite: VITE_VERSION,
        },
      }),
    },
    {
      path: "tsconfig.json",
      content: formatJson({
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          jsx: "react-jsx",
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          types: ["vite/client"],
        },
        include: ["src"],
      }),
    },
    {
      path: "vite.config.ts",
      content: `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
`,
    },
    {
      path: "index.html",
      content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${toDisplayName(name)}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    },
    {
      path: "src/main.tsx",
      content: `import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`,
    },
    {
      path: "src/App.tsx",
      content: `import "./App.css";

export function App() {
  return (
    <main className="app-shell">
      <section className="app-card">
        <span className="app-eyebrow">Shipyard starter</span>
        <h1>${toDisplayName(name)}</h1>
        <p>${description}</p>
      </section>
    </main>
  );
}
`,
    },
    {
      path: "src/App.css",
      content: `.app-shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  margin: 0;
  padding: 2rem;
  background:
    radial-gradient(circle at top, rgba(59, 130, 246, 0.18), transparent 42%),
    linear-gradient(180deg, #08111f 0%, #122032 100%);
  color: #f8fafc;
  font-family: "Inter", "Segoe UI", sans-serif;
}

.app-card {
  width: min(100%, 40rem);
  padding: 2rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1.5rem;
  background: rgba(15, 23, 42, 0.78);
  box-shadow: 0 24px 80px rgba(8, 15, 31, 0.45);
}

.app-card h1 {
  margin: 0.5rem 0 0.75rem;
  font-size: clamp(2rem, 4vw, 3rem);
  line-height: 1.1;
}

.app-card p {
  margin: 0;
  font-size: 1rem;
  line-height: 1.6;
  color: rgba(226, 232, 240, 0.88);
}

.app-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #7dd3fc;
}
`,
    },
    {
      path: "src/vite-env.d.ts",
      content: `/// <reference types="vite/client" />
`,
    },
  ];
}

function createExpressTsScaffold(
  name: string,
  description: string,
): ScaffoldFile[] {
  return [
    ...createBaseFiles(name, description),
    {
      path: "package.json",
      content: formatJson({
        name,
        private: true,
        version: "0.1.0",
        type: "module",
        scripts: {
          dev: "tsx watch src/index.ts",
          build: "tsc -p tsconfig.json",
          start: "node dist/index.js",
        },
        dependencies: {
          express: EXPRESS_VERSION,
        },
        devDependencies: {
          "@types/express": EXPRESS_TYPES_VERSION,
          tsx: TSX_VERSION,
          typescript: TYPESCRIPT_VERSION,
        },
      }),
    },
    {
      path: "tsconfig.json",
      content: formatJson({
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          esModuleInterop: true,
          outDir: "dist",
          skipLibCheck: true,
        },
        include: ["src"],
      }),
    },
    {
      path: "src/index.ts",
      content: `import express from "express";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.get("/", (_request, response) => {
  response.json({
    name: "${name}",
    status: "ok",
  });
});

app.listen(port, () => {
  console.log("Listening on", port);
});
`,
    },
  ];
}

function createPythonScaffold(name: string, description: string): ScaffoldFile[] {
  return [
    ...createBaseFiles(name, description),
    {
      path: "pyproject.toml",
      content: `[project]
name = "${name}"
version = "0.1.0"
description = "${description.replace(/"/gu, '\\"')}"
requires-python = ">=3.11"

[build-system]
requires = ["setuptools>=61"]
build-backend = "setuptools.build_meta"
`,
    },
    {
      path: "src/__init__.py",
      content: "",
    },
    {
      path: "src/main.py",
      content: `def main() -> None:
    print("Hello from ${name}")


if __name__ == "__main__":
    main()
`,
    },
  ];
}

function createGoScaffold(name: string, description: string): ScaffoldFile[] {
  return [
    ...createBaseFiles(name, description),
    {
      path: "go.mod",
      content: `module ${name}

go 1.22
`,
    },
    {
      path: "main.go",
      content: `package main

import "fmt"

func main() {
\tfmt.Println("Hello from ${name}")
}
`,
    },
  ];
}

export function getScaffoldFiles(
  scaffoldType: ScaffoldType,
  name: string,
  description: string,
): ScaffoldFile[] {
  switch (scaffoldType) {
    case "ts-pnpm-workspace":
      return createTsPnpmWorkspaceScaffold(name, description);
    case "react-ts":
      return createReactTsScaffold(name, description);
    case "express-ts":
      return createExpressTsScaffold(name, description);
    case "python":
      return createPythonScaffold(name, description);
    case "go":
      return createGoScaffold(name, description);
    case "empty":
      return createBaseFiles(name, description);
  }
}
