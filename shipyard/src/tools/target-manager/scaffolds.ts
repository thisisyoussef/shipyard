export type ScaffoldType = "react-ts" | "express-ts" | "python" | "go" | "empty";

export interface ScaffoldFile {
  path: string;
  content: string;
}

export const SCAFFOLD_TYPES: ScaffoldType[] = [
  "react-ts",
  "express-ts",
  "python",
  "go",
  "empty",
];

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

function createReactTsScaffold(
  name: string,
  description: string,
): ScaffoldFile[] {
  return [
    ...createBaseFiles(name, description),
    {
      path: "package.json",
      content: `${JSON.stringify(
        {
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
            react: "^19.2.4",
            "react-dom": "^19.2.4",
          },
          devDependencies: {
            "@types/react": "^19.2.14",
            "@types/react-dom": "^19.2.3",
            "@vitejs/plugin-react": "^6.0.1",
            typescript: "^6.0.2",
            vite: "^8.0.2",
          },
        },
        null,
        2,
      )}\n`,
    },
    {
      path: "tsconfig.json",
      content: `${JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "Bundler",
            jsx: "react-jsx",
            strict: true,
            noEmit: true,
            skipLibCheck: true,
          },
          include: ["src"],
        },
        null,
        2,
      )}\n`,
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
import { App } from "./App.js";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`,
    },
    {
      path: "src/App.tsx",
      content: `export function App() {
  return (
    <main>
      <h1>${toDisplayName(name)}</h1>
      <p>${description}</p>
    </main>
  );
}
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
      content: `${JSON.stringify(
        {
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
            express: "^5.1.0",
          },
          devDependencies: {
            "@types/express": "^5.0.3",
            tsx: "^4.21.0",
            typescript: "^6.0.2",
          },
        },
        null,
        2,
      )}\n`,
    },
    {
      path: "tsconfig.json",
      content: `${JSON.stringify(
        {
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
        },
        null,
        2,
      )}\n`,
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
	fmt.Println("Hello from ${name}")
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
