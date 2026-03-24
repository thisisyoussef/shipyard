# Target Manager Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users select, create, enrich, and switch targets interactively from both the terminal REPL and browser workbench, with AI-generated project profiles.

**Architecture:** A new `target-manager` phase with 4 registered tools (`list_targets`, `select_target`, `create_target`, `enrich_target`), a `TargetProfile` data model persisted to `.shipyard/profile.json`, CLI changes to make `--target` optional, a `target` REPL command for runtime switching, and WebSocket contracts + React components for the browser surface.

**Tech Stack:** TypeScript, Vitest, Zod (browser contracts), React (workbench UI), Anthropic SDK (enrichment)

---

## Story 1: PTM-S01 — Target Manager Tools & Data Model

### Task 1: Define `TargetProfile` type

**Files:**
- Modify: `shipyard/src/artifacts/types.ts:35-46`

**Step 1: Write the failing test**

Create `shipyard/tests/target-manager.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type { TargetProfile } from "../src/artifacts/types.js";

describe("TargetProfile type", () => {
  it("conforms to the expected shape", () => {
    const profile: TargetProfile = {
      name: "test-project",
      description: "A test project for validation.",
      purpose: "Testing target manager tooling.",
      stack: ["TypeScript", "Vitest"],
      architecture: "Single-module CLI application",
      keyPatterns: ["barrel exports"],
      complexity: "small",
      suggestedAgentsRules: "# AGENTS.md\nPrefer TypeScript.",
      suggestedScripts: { test: "vitest" },
      taskSuggestions: ["Add a README"],
      enrichedAt: "2026-03-24T00:00:00.000Z",
      enrichmentModel: "claude-sonnet-4-5-20250514",
      discoverySnapshot: {
        isGreenfield: false,
        language: "typescript",
        framework: null,
        packageManager: "pnpm",
        scripts: {},
        hasReadme: true,
        hasAgentsMd: false,
        topLevelFiles: ["package.json", "tsconfig.json"],
        topLevelDirectories: ["src"],
        projectName: "test-project",
      },
    };

    expect(profile.name).toBe("test-project");
    expect(profile.complexity).toBe("small");
    expect(profile.discoverySnapshot.language).toBe("typescript");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --dir shipyard test -- tests/target-manager.test.ts`
Expected: FAIL — `TargetProfile` does not exist in types.ts yet.

**Step 3: Write minimal implementation**

Add to `shipyard/src/artifacts/types.ts` after `DiscoveryReport`:

```typescript
export interface TargetProfile {
  name: string;
  description: string;
  purpose: string;
  stack: string[];
  architecture: string;
  keyPatterns: string[];
  complexity: "trivial" | "small" | "medium" | "large";
  suggestedAgentsRules: string;
  suggestedScripts: Record<string, string>;
  taskSuggestions: string[];
  enrichedAt: string;
  enrichmentModel: string;
  discoverySnapshot: DiscoveryReport;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --dir shipyard test -- tests/target-manager.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add shipyard/src/artifacts/types.ts shipyard/tests/target-manager.test.ts
git commit -m "feat(target-manager): define TargetProfile type"
```

---

### Task 2: Implement profile I/O

**Files:**
- Create: `shipyard/src/tools/target-manager/profile-io.ts`

**Step 1: Write the failing test**

Add to `shipyard/tests/target-manager.test.ts`:

```typescript
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadTargetProfile, saveTargetProfile } from "../src/tools/target-manager/profile-io.js";
import { ensureShipyardDirectories } from "../src/engine/state.js";

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs) {
    await rm(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

describe("profile I/O", () => {
  it("round-trips a TargetProfile through profile.json", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "shipyard-profile-"));
    tempDirs.push(dir);
    await ensureShipyardDirectories(dir);

    const profile: TargetProfile = {
      name: "round-trip",
      description: "Tests round-trip fidelity.",
      purpose: "Testing.",
      stack: ["TypeScript"],
      architecture: "Flat",
      keyPatterns: [],
      complexity: "trivial",
      suggestedAgentsRules: "",
      suggestedScripts: {},
      taskSuggestions: [],
      enrichedAt: new Date().toISOString(),
      enrichmentModel: "test",
      discoverySnapshot: {
        isGreenfield: true,
        language: null,
        framework: null,
        packageManager: null,
        scripts: {},
        hasReadme: false,
        hasAgentsMd: false,
        topLevelFiles: [],
        topLevelDirectories: [],
        projectName: null,
      },
    };

    await saveTargetProfile(dir, profile);
    const loaded = await loadTargetProfile(dir);
    expect(loaded).toEqual(profile);
  });

  it("returns null when no profile exists", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "shipyard-profile-"));
    tempDirs.push(dir);
    await ensureShipyardDirectories(dir);

    const loaded = await loadTargetProfile(dir);
    expect(loaded).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --dir shipyard test -- tests/target-manager.test.ts`
Expected: FAIL — module not found.

**Step 3: Write minimal implementation**

Create `shipyard/src/tools/target-manager/profile-io.ts`:

```typescript
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { TargetProfile } from "../../artifacts/types.js";
import { getShipyardDirectory } from "../../engine/state.js";

function getProfilePath(targetDirectory: string): string {
  return path.join(getShipyardDirectory(targetDirectory), "profile.json");
}

export async function saveTargetProfile(
  targetDirectory: string,
  profile: TargetProfile,
): Promise<string> {
  const profilePath = getProfilePath(targetDirectory);
  await writeFile(profilePath, JSON.stringify(profile, null, 2), "utf8");
  return profilePath;
}

export async function loadTargetProfile(
  targetDirectory: string,
): Promise<TargetProfile | null> {
  const profilePath = getProfilePath(targetDirectory);

  try {
    await access(profilePath);
  } catch {
    return null;
  }

  const contents = await readFile(profilePath, "utf8");
  return JSON.parse(contents) as TargetProfile;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --dir shipyard test -- tests/target-manager.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add shipyard/src/tools/target-manager/profile-io.ts shipyard/tests/target-manager.test.ts
git commit -m "feat(target-manager): implement profile I/O with round-trip test"
```

---

### Task 3: Implement `list_targets` tool

**Files:**
- Create: `shipyard/src/tools/target-manager/list-targets.ts`

**Step 1: Write the failing test**

Add to `shipyard/tests/target-manager.test.ts`:

```typescript
import { mkdir, writeFile as fsWriteFile } from "node:fs/promises";
import { listTargetsTool, type TargetListEntry } from "../src/tools/target-manager/list-targets.js";

describe("list_targets tool", () => {
  it("lists subdirectories with discovery metadata", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "shipyard-targets-"));
    tempDirs.push(dir);

    // Create a fake repo with package.json
    const repoDir = path.join(dir, "my-app");
    await mkdir(repoDir, { recursive: true });
    await fsWriteFile(
      path.join(repoDir, "package.json"),
      JSON.stringify({ name: "my-app" }),
    );

    // Create a non-repo directory (empty)
    const emptyDir = path.join(dir, "empty-folder");
    await mkdir(emptyDir, { recursive: true });

    const entries = await listTargetsTool({ targetsDir: dir });
    expect(entries.length).toBeGreaterThanOrEqual(1);

    const myApp = entries.find((e) => e.name === "my-app");
    expect(myApp).toBeDefined();
    expect(myApp!.path).toBe(repoDir);
  });

  it("returns empty array for empty directory", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "shipyard-targets-empty-"));
    tempDirs.push(dir);

    const entries = await listTargetsTool({ targetsDir: dir });
    expect(entries).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --dir shipyard test -- tests/target-manager.test.ts`
Expected: FAIL — module not found.

**Step 3: Write minimal implementation**

Create `shipyard/src/tools/target-manager/list-targets.ts`:

```typescript
import { readdir } from "node:fs/promises";
import path from "node:path";

import { discoverTarget, formatDiscoverySummary } from "../../context/discovery.js";
import { loadTargetProfile } from "./profile-io.js";
import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolDefinition,
  type ToolInputSchema,
} from "../registry.js";

export interface TargetListEntry {
  name: string;
  path: string;
  discoverySummary: string;
  hasProfile: boolean;
  language: string | null;
  framework: string | null;
}

export interface ListTargetsInput {
  targetsDir: string;
}

const listTargetsInputSchema = {
  type: "object",
  properties: {
    targets_dir: {
      type: "string",
      description: "Absolute path to the directory containing target repos.",
    },
  },
  required: ["targets_dir"],
  additionalProperties: false,
} satisfies ToolInputSchema;

export async function listTargetsTool(
  input: ListTargetsInput,
): Promise<TargetListEntry[]> {
  const entries = await readdir(input.targetsDir, { withFileTypes: true });
  const directories = entries.filter(
    (e) => e.isDirectory() && !e.name.startsWith("."),
  );
  const results: TargetListEntry[] = [];

  for (const dir of directories) {
    const fullPath = path.join(input.targetsDir, dir.name);
    const discovery = await discoverTarget(fullPath);
    const profile = await loadTargetProfile(fullPath);

    results.push({
      name: dir.name,
      path: fullPath,
      discoverySummary: formatDiscoverySummary(discovery),
      hasProfile: profile !== null,
      language: discovery.language,
      framework: discovery.framework,
    });
  }

  return results;
}

export const listTargetsDefinition: ToolDefinition<{ targets_dir: string }> = {
  name: "list_targets",
  description:
    "Scan a directory for subdirectories that look like project repos and return metadata for each.",
  inputSchema: listTargetsInputSchema,
  async execute(input, _targetDirectory) {
    try {
      const result = await listTargetsTool({
        targetsDir: input.targets_dir,
      });

      if (result.length === 0) {
        return createToolSuccessResult(
          "No targets found in the specified directory.",
        );
      }

      const lines = result.map(
        (entry) =>
          `${entry.name} — ${entry.discoverySummary}${entry.hasProfile ? " (enriched)" : ""}`,
      );

      return createToolSuccessResult(lines.join("\n"));
    } catch (error) {
      return createToolErrorResult(error);
    }
  },
};

registerTool(listTargetsDefinition);
```

**Step 4: Run test to verify it passes**

Run: `pnpm --dir shipyard test -- tests/target-manager.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add shipyard/src/tools/target-manager/list-targets.ts shipyard/tests/target-manager.test.ts
git commit -m "feat(target-manager): implement list_targets tool"
```

---

### Task 4: Implement `select_target` tool

**Files:**
- Create: `shipyard/src/tools/target-manager/select-target.ts`

**Step 1: Write the failing test**

Add to `shipyard/tests/target-manager.test.ts`:

```typescript
import { selectTargetTool } from "../src/tools/target-manager/select-target.js";

describe("select_target tool", () => {
  it("resolves a valid target and returns discovery", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "shipyard-select-"));
    tempDirs.push(dir);
    await fsWriteFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "select-test" }),
    );

    const result = await selectTargetTool({ targetPath: dir });
    expect(result.path).toBe(dir);
    expect(result.discovery).toBeDefined();
    expect(result.discovery.projectName).toBe("select-test");
    expect(result.profile).toBeNull();
  });

  it("loads existing profile if present", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "shipyard-select-prof-"));
    tempDirs.push(dir);
    await ensureShipyardDirectories(dir);

    const profile: TargetProfile = {
      name: "profiled",
      description: "Has a profile.",
      purpose: "Testing.",
      stack: [],
      architecture: "",
      keyPatterns: [],
      complexity: "trivial",
      suggestedAgentsRules: "",
      suggestedScripts: {},
      taskSuggestions: [],
      enrichedAt: new Date().toISOString(),
      enrichmentModel: "test",
      discoverySnapshot: {
        isGreenfield: true, language: null, framework: null,
        packageManager: null, scripts: {}, hasReadme: false,
        hasAgentsMd: false, topLevelFiles: [], topLevelDirectories: [],
        projectName: null,
      },
    };
    await saveTargetProfile(dir, profile);

    const result = await selectTargetTool({ targetPath: dir });
    expect(result.profile).toEqual(profile);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --dir shipyard test -- tests/target-manager.test.ts`
Expected: FAIL — module not found.

**Step 3: Write minimal implementation**

Create `shipyard/src/tools/target-manager/select-target.ts`:

```typescript
import { mkdir } from "node:fs/promises";
import path from "node:path";

import type { DiscoveryReport, TargetProfile } from "../../artifacts/types.js";
import { discoverTarget } from "../../context/discovery.js";
import { ensureShipyardDirectories } from "../../engine/state.js";
import { loadTargetProfile } from "./profile-io.js";
import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolDefinition,
  type ToolInputSchema,
} from "../registry.js";

export interface SelectTargetInput {
  targetPath: string;
}

export interface SelectTargetResult {
  path: string;
  discovery: DiscoveryReport;
  profile: TargetProfile | null;
}

const selectTargetInputSchema = {
  type: "object",
  properties: {
    target_path: {
      type: "string",
      description: "Absolute path to the target directory to select.",
    },
  },
  required: ["target_path"],
  additionalProperties: false,
} satisfies ToolInputSchema;

export async function selectTargetTool(
  input: SelectTargetInput,
): Promise<SelectTargetResult> {
  const resolvedPath = path.resolve(input.targetPath);
  await mkdir(resolvedPath, { recursive: true });
  await ensureShipyardDirectories(resolvedPath);

  const discovery = await discoverTarget(resolvedPath);
  const profile = await loadTargetProfile(resolvedPath);

  return { path: resolvedPath, discovery, profile };
}

export const selectTargetDefinition: ToolDefinition<{ target_path: string }> = {
  name: "select_target",
  description:
    "Validate and select a target directory. Returns discovery metadata and existing profile if available.",
  inputSchema: selectTargetInputSchema,
  async execute(input, _targetDirectory) {
    try {
      const result = await selectTargetTool({
        targetPath: input.target_path,
      });

      const profileNote = result.profile
        ? `Enriched profile loaded: "${result.profile.description}"`
        : "No profile found. Run enrich_target to generate one.";

      return createToolSuccessResult(
        `Selected target: ${result.path}\n` +
        `Discovery: ${result.discovery.language ?? "unknown"} / ${result.discovery.framework ?? "no framework"}\n` +
        profileNote,
      );
    } catch (error) {
      return createToolErrorResult(error);
    }
  },
};

registerTool(selectTargetDefinition);
```

**Step 4: Run test to verify it passes**

Run: `pnpm --dir shipyard test -- tests/target-manager.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add shipyard/src/tools/target-manager/select-target.ts shipyard/tests/target-manager.test.ts
git commit -m "feat(target-manager): implement select_target tool"
```

---

### Task 5: Implement scaffold templates

**Files:**
- Create: `shipyard/src/tools/target-manager/scaffolds.ts`

**Step 1: Write the failing test**

Add to `shipyard/tests/target-manager.test.ts`:

```typescript
import { getScaffoldFiles, SCAFFOLD_TYPES } from "../src/tools/target-manager/scaffolds.js";

describe("scaffold templates", () => {
  it("returns files for each scaffold type", () => {
    for (const type of SCAFFOLD_TYPES) {
      const files = getScaffoldFiles(type);
      expect(files.length).toBeGreaterThan(0);

      for (const file of files) {
        expect(file.path).toBeTruthy();
        expect(file.content).toBeTruthy();
      }
    }
  });

  it("empty scaffold has only README and AGENTS", () => {
    const files = getScaffoldFiles("empty");
    const paths = files.map((f) => f.path);
    expect(paths).toContain("README.md");
    expect(paths).toContain("AGENTS.md");
    expect(paths.length).toBe(2);
  });

  it("react-ts scaffold has package.json and src/App.tsx", () => {
    const files = getScaffoldFiles("react-ts");
    const paths = files.map((f) => f.path);
    expect(paths).toContain("package.json");
    expect(paths).toContain("src/App.tsx");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --dir shipyard test -- tests/target-manager.test.ts`
Expected: FAIL — module not found.

**Step 3: Write minimal implementation**

Create `shipyard/src/tools/target-manager/scaffolds.ts`:

```typescript
export type ScaffoldType = "react-ts" | "express-ts" | "python" | "go" | "empty";

export const SCAFFOLD_TYPES: ScaffoldType[] = [
  "react-ts",
  "express-ts",
  "python",
  "go",
  "empty",
];

export interface ScaffoldFile {
  path: string;
  content: string;
}

function emptyScaffold(name: string, description: string): ScaffoldFile[] {
  return [
    { path: "README.md", content: `# ${name}\n\n${description}\n` },
    {
      path: "AGENTS.md",
      content: `# ${name} — Agent Rules\n\n- Follow the project README for context.\n- Ask before making large structural changes.\n`,
    },
  ];
}

function reactTsScaffold(name: string, description: string): ScaffoldFile[] {
  return [
    ...emptyScaffold(name, description),
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name,
          private: true,
          version: "0.0.1",
          type: "module",
          scripts: {
            dev: "vite",
            build: "tsc -b && vite build",
            preview: "vite preview",
          },
          dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
          devDependencies: {
            "@types/react": "^19.0.0",
            "@types/react-dom": "^19.0.0",
            typescript: "~5.7.0",
            vite: "^6.0.0",
            "@vitejs/plugin-react": "^4.0.0",
          },
        },
        null,
        2,
      ),
    },
    {
      path: "tsconfig.json",
      content: JSON.stringify(
        {
          compilerOptions: {
            target: "ES2020",
            module: "ESNext",
            moduleResolution: "bundler",
            jsx: "react-jsx",
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            outDir: "dist",
          },
          include: ["src"],
        },
        null,
        2,
      ),
    },
    {
      path: "vite.config.ts",
      content: `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\n\nexport default defineConfig({\n  plugins: [react()],\n});\n`,
    },
    {
      path: "index.html",
      content: `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${name}</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>\n`,
    },
    {
      path: "src/main.tsx",
      content: `import React from "react";\nimport ReactDOM from "react-dom/client";\nimport { App } from "./App.js";\n\nReactDOM.createRoot(document.getElementById("root")!).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>,\n);\n`,
    },
    {
      path: "src/App.tsx",
      content: `export function App() {\n  return <h1>${name}</h1>;\n}\n`,
    },
  ];
}

function expressTsScaffold(name: string, description: string): ScaffoldFile[] {
  return [
    ...emptyScaffold(name, description),
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name,
          private: true,
          version: "0.0.1",
          type: "module",
          scripts: { dev: "tsx watch src/index.ts", build: "tsc", start: "node dist/index.js" },
          dependencies: { express: "^5.0.0" },
          devDependencies: { "@types/express": "^5.0.0", typescript: "~5.7.0", tsx: "^4.0.0" },
        },
        null,
        2,
      ),
    },
    {
      path: "tsconfig.json",
      content: JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "nodenext",
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            outDir: "dist",
          },
          include: ["src"],
        },
        null,
        2,
      ),
    },
    {
      path: "src/index.ts",
      content: `import express from "express";\n\nconst app = express();\nconst port = process.env.PORT ?? 3000;\n\napp.get("/", (_req, res) => {\n  res.json({ status: "ok" });\n});\n\napp.listen(port, () => {\n  console.log(\`Listening on port \${port}\`);\n});\n`,
    },
  ];
}

function pythonScaffold(name: string, description: string): ScaffoldFile[] {
  return [
    ...emptyScaffold(name, description),
    {
      path: "pyproject.toml",
      content: `[project]\nname = "${name}"\nversion = "0.0.1"\ndescription = "${description}"\nrequires-python = ">=3.11"\n\n[build-system]\nrequires = ["setuptools"]\nbuild-backend = "setuptools.backends._legacy:_Backend"\n`,
    },
    { path: "src/__init__.py", content: "" },
    {
      path: "src/main.py",
      content: `def main() -> None:\n    print("Hello from ${name}")\n\n\nif __name__ == "__main__":\n    main()\n`,
    },
  ];
}

function goScaffold(name: string, description: string): ScaffoldFile[] {
  return [
    ...emptyScaffold(name, description),
    {
      path: "go.mod",
      content: `module ${name}\n\ngo 1.22\n`,
    },
    {
      path: "main.go",
      content: `package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello from ${name}")\n}\n`,
    },
  ];
}

export function getScaffoldFiles(
  type: ScaffoldType,
  name = "my-project",
  description = "A new project.",
): ScaffoldFile[] {
  switch (type) {
    case "react-ts":
      return reactTsScaffold(name, description);
    case "express-ts":
      return expressTsScaffold(name, description);
    case "python":
      return pythonScaffold(name, description);
    case "go":
      return goScaffold(name, description);
    case "empty":
      return emptyScaffold(name, description);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --dir shipyard test -- tests/target-manager.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add shipyard/src/tools/target-manager/scaffolds.ts shipyard/tests/target-manager.test.ts
git commit -m "feat(target-manager): implement scaffold templates for 5 project types"
```

---

### Task 6: Implement `create_target` tool

**Files:**
- Create: `shipyard/src/tools/target-manager/create-target.ts`

**Step 1: Write the failing test**

Add to `shipyard/tests/target-manager.test.ts`:

```typescript
import { createTargetTool } from "../src/tools/target-manager/create-target.js";

describe("create_target tool", () => {
  it("creates a directory with scaffold files and git init", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "shipyard-create-"));
    tempDirs.push(dir);
    const targetPath = path.join(dir, "new-app");

    const result = await createTargetTool({
      name: "new-app",
      description: "A brand new application.",
      targetsDir: dir,
      scaffoldType: "empty",
    });

    expect(result.path).toBe(targetPath);
    expect(result.discovery).toBeDefined();

    // Verify files exist
    const readme = await readFile(path.join(targetPath, "README.md"), "utf8");
    expect(readme).toContain("new-app");

    const agents = await readFile(path.join(targetPath, "AGENTS.md"), "utf8");
    expect(agents).toContain("new-app");
  });

  it("creates react-ts scaffold with package.json", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "shipyard-create-react-"));
    tempDirs.push(dir);

    const result = await createTargetTool({
      name: "react-app",
      description: "A React app.",
      targetsDir: dir,
      scaffoldType: "react-ts",
    });

    const pkg = await readFile(path.join(result.path, "package.json"), "utf8");
    expect(JSON.parse(pkg).name).toBe("react-app");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --dir shipyard test -- tests/target-manager.test.ts`
Expected: FAIL — module not found.

**Step 3: Write minimal implementation**

Create `shipyard/src/tools/target-manager/create-target.ts`:

```typescript
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { DiscoveryReport } from "../../artifacts/types.js";
import { discoverTarget } from "../../context/discovery.js";
import { ensureShipyardDirectories } from "../../engine/state.js";
import { getScaffoldFiles, type ScaffoldType } from "./scaffolds.js";
import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolDefinition,
  type ToolInputSchema,
} from "../registry.js";

const execFileAsync = promisify(execFile);

export interface CreateTargetInput {
  name: string;
  description: string;
  targetsDir: string;
  scaffoldType?: ScaffoldType;
}

export interface CreateTargetResult {
  path: string;
  discovery: DiscoveryReport;
}

const createTargetInputSchema = {
  type: "object",
  properties: {
    name: {
      type: "string",
      description: "Name for the new target directory.",
    },
    description: {
      type: "string",
      description: "Human-readable description of what this project is for.",
    },
    targets_dir: {
      type: "string",
      description: "Parent directory where the target will be created.",
    },
    scaffold_type: {
      type: "string",
      description: "Type of starter scaffold to generate.",
      enum: ["react-ts", "express-ts", "python", "go", "empty"],
    },
  },
  required: ["name", "description", "targets_dir"],
  additionalProperties: false,
} satisfies ToolInputSchema;

export async function createTargetTool(
  input: CreateTargetInput,
): Promise<CreateTargetResult> {
  const targetPath = path.join(input.targetsDir, input.name);
  await mkdir(targetPath, { recursive: true });

  const scaffoldType = input.scaffoldType ?? "empty";
  const files = getScaffoldFiles(scaffoldType, input.name, input.description);

  for (const file of files) {
    const filePath = path.join(targetPath, file.path);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, file.content, "utf8");
  }

  try {
    await execFileAsync("git", ["init"], { cwd: targetPath });
  } catch {
    // git init failure is non-fatal — target is still usable
  }

  await ensureShipyardDirectories(targetPath);
  const discovery = await discoverTarget(targetPath);

  return { path: targetPath, discovery };
}

export const createTargetDefinition: ToolDefinition<{
  name: string;
  description: string;
  targets_dir: string;
  scaffold_type?: string;
}> = {
  name: "create_target",
  description:
    "Create a new target directory with scaffold files, git init, README, and AGENTS.md.",
  inputSchema: createTargetInputSchema,
  async execute(input, _targetDirectory) {
    try {
      const result = await createTargetTool({
        name: input.name,
        description: input.description,
        targetsDir: input.targets_dir,
        scaffoldType: (input.scaffold_type as ScaffoldType) ?? "empty",
      });

      return createToolSuccessResult(
        `Created target "${input.name}" at ${result.path}\n` +
        `Scaffold: ${input.scaffold_type ?? "empty"}\n` +
        `Language: ${result.discovery.language ?? "none detected"}`,
      );
    } catch (error) {
      return createToolErrorResult(error);
    }
  },
};

registerTool(createTargetDefinition);
```

**Step 4: Run test to verify it passes**

Run: `pnpm --dir shipyard test -- tests/target-manager.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add shipyard/src/tools/target-manager/create-target.ts shipyard/tests/target-manager.test.ts
git commit -m "feat(target-manager): implement create_target tool with scaffolding"
```

---

### Task 7: Implement `enrich_target` tool

**Files:**
- Create: `shipyard/src/tools/target-manager/enrich-target.ts`

**Step 1: Write the failing test**

Add to `shipyard/tests/target-manager.test.ts`:

```typescript
import { enrichTargetTool, type EnrichTargetInput } from "../src/tools/target-manager/enrich-target.js";

describe("enrich_target tool", () => {
  it("produces a valid TargetProfile for a greenfield target", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "shipyard-enrich-"));
    tempDirs.push(dir);
    await ensureShipyardDirectories(dir);
    await fsWriteFile(path.join(dir, "README.md"), "# Test\nA test project.\n");

    // Mock: the actual enrichment calls Claude, so we test the file reading
    // and profile shape. Full enrichment is a manual smoke test.
    // For unit testing, we test buildEnrichmentContext which is the pre-LLM step.
    const { buildEnrichmentContext } = await import(
      "../src/tools/target-manager/enrich-target.js"
    );
    const context = await buildEnrichmentContext(dir, undefined);

    expect(context.discovery).toBeDefined();
    expect(context.fileContents.length).toBeGreaterThan(0);
    expect(context.fileContents[0].path).toBe("README.md");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --dir shipyard test -- tests/target-manager.test.ts`
Expected: FAIL — module not found.

**Step 3: Write minimal implementation**

Create `shipyard/src/tools/target-manager/enrich-target.ts`:

```typescript
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import type { DiscoveryReport, TargetProfile } from "../../artifacts/types.js";
import { discoverTarget } from "../../context/discovery.js";
import { saveTargetProfile } from "./profile-io.js";
import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolDefinition,
  type ToolInputSchema,
} from "../registry.js";

const MAX_FILES_TO_READ = 20;
const MAX_LINES_PER_FILE = 500;

const PRIORITY_FILES = [
  "README.md",
  "readme.md",
  "AGENTS.md",
  "package.json",
  "pyproject.toml",
  "go.mod",
  "Cargo.toml",
  "tsconfig.json",
  "vite.config.ts",
  "next.config.js",
  "next.config.ts",
];

export interface EnrichmentContext {
  discovery: DiscoveryReport;
  fileContents: Array<{ path: string; content: string }>;
  userDescription?: string;
}

export interface EnrichTargetInput {
  targetPath: string;
  userDescription?: string;
}

const enrichTargetInputSchema = {
  type: "object",
  properties: {
    target_path: {
      type: "string",
      description: "Absolute path to the target directory to enrich.",
    },
    user_description: {
      type: "string",
      description:
        "Optional user-provided description of the project. Used for greenfield targets.",
    },
  },
  required: ["target_path"],
  additionalProperties: false,
} satisfies ToolInputSchema;

function truncateFileContent(content: string): string {
  const lines = content.split("\n");

  if (lines.length <= MAX_LINES_PER_FILE) {
    return content;
  }

  return lines.slice(0, MAX_LINES_PER_FILE).join("\n") + "\n... (truncated)";
}

export async function buildEnrichmentContext(
  targetPath: string,
  userDescription: string | undefined,
): Promise<EnrichmentContext> {
  const discovery = await discoverTarget(targetPath);
  const fileContents: Array<{ path: string; content: string }> = [];

  // Read priority files first
  for (const fileName of PRIORITY_FILES) {
    if (fileContents.length >= MAX_FILES_TO_READ) break;

    try {
      const content = await readFile(path.join(targetPath, fileName), "utf8");
      fileContents.push({ path: fileName, content: truncateFileContent(content) });
    } catch {
      // file doesn't exist, skip
    }
  }

  // Fill remaining slots with top-level source files
  if (fileContents.length < MAX_FILES_TO_READ) {
    const topLevelSourceFiles = discovery.topLevelFiles.filter(
      (f) =>
        !PRIORITY_FILES.includes(f) &&
        /\.(ts|tsx|js|jsx|py|go|rs)$/.test(f),
    );

    for (const fileName of topLevelSourceFiles) {
      if (fileContents.length >= MAX_FILES_TO_READ) break;

      try {
        const content = await readFile(path.join(targetPath, fileName), "utf8");
        fileContents.push({ path: fileName, content: truncateFileContent(content) });
      } catch {
        // skip unreadable files
      }
    }
  }

  // Read files from src/ directory if it exists
  if (
    fileContents.length < MAX_FILES_TO_READ &&
    discovery.topLevelDirectories.includes("src")
  ) {
    try {
      const srcEntries = await readdir(path.join(targetPath, "src"), {
        withFileTypes: true,
      });
      const srcFiles = srcEntries
        .filter((e) => e.isFile() && /\.(ts|tsx|js|jsx|py|go|rs)$/.test(e.name))
        .slice(0, MAX_FILES_TO_READ - fileContents.length);

      for (const entry of srcFiles) {
        try {
          const content = await readFile(
            path.join(targetPath, "src", entry.name),
            "utf8",
          );
          fileContents.push({
            path: `src/${entry.name}`,
            content: truncateFileContent(content),
          });
        } catch {
          // skip
        }
      }
    } catch {
      // src directory not readable
    }
  }

  return { discovery, fileContents, userDescription };
}

export function buildEnrichmentPrompt(context: EnrichmentContext): string {
  const fileSection = context.fileContents
    .map((f) => `--- ${f.path} ---\n${f.content}`)
    .join("\n\n");

  const descriptionHint = context.userDescription
    ? `\nThe user describes this project as: "${context.userDescription}"\n`
    : "";

  return `Analyze this project and produce a JSON object matching the TargetProfile schema.

Discovery facts:
- Language: ${context.discovery.language ?? "unknown"}
- Framework: ${context.discovery.framework ?? "none"}
- Package manager: ${context.discovery.packageManager ?? "none"}
- Project name: ${context.discovery.projectName ?? "unknown"}
- Is greenfield: ${context.discovery.isGreenfield}
${descriptionHint}
File contents:
${fileSection || "(no files available)"}

Respond with ONLY a JSON object (no markdown fencing) with these exact fields:
{
  "name": "string — human-friendly project name",
  "description": "string — 1-2 sentence summary",
  "purpose": "string — what problem this project solves",
  "stack": ["array of technologies"],
  "architecture": "string — architectural pattern description",
  "keyPatterns": ["array of notable code patterns"],
  "complexity": "trivial | small | medium | large",
  "suggestedAgentsRules": "string — proposed AGENTS.md content",
  "suggestedScripts": {"key": "value pairs of useful scripts"},
  "taskSuggestions": ["array of 3-5 starter tasks"]
}`;
}

export function parseEnrichmentResponse(
  responseText: string,
  discovery: DiscoveryReport,
  model: string,
): TargetProfile {
  // Strip markdown code fences if present
  const cleaned = responseText
    .replace(/^```(?:json)?\s*\n?/m, "")
    .replace(/\n?```\s*$/m, "")
    .trim();

  const parsed = JSON.parse(cleaned) as Omit<
    TargetProfile,
    "enrichedAt" | "enrichmentModel" | "discoverySnapshot"
  >;

  return {
    ...parsed,
    enrichedAt: new Date().toISOString(),
    enrichmentModel: model,
    discoverySnapshot: discovery,
  };
}

export async function enrichTargetTool(
  input: EnrichTargetInput,
  callClaude: (prompt: string) => Promise<{ text: string; model: string }>,
): Promise<TargetProfile> {
  const context = await buildEnrichmentContext(
    input.targetPath,
    input.userDescription,
  );
  const prompt = buildEnrichmentPrompt(context);
  const response = await callClaude(prompt);
  const profile = parseEnrichmentResponse(
    response.text,
    context.discovery,
    response.model,
  );

  await saveTargetProfile(input.targetPath, profile);

  return profile;
}

export const enrichTargetDefinition: ToolDefinition<{
  target_path: string;
  user_description?: string;
}> = {
  name: "enrich_target",
  description:
    "Run AI enrichment on a target to generate a full project profile with description, stack analysis, architecture, and task suggestions.",
  inputSchema: enrichTargetInputSchema,
  async execute(input, _targetDirectory) {
    // NOTE: The actual Claude call is wired in at runtime via the enrichment
    // callback. This tool definition provides the schema; the execute handler
    // will be overridden when the target manager phase is integrated.
    return createToolErrorResult(
      "enrich_target requires runtime wiring. Use the target manager phase to invoke enrichment.",
    );
  },
};

registerTool(enrichTargetDefinition);
```

**Step 4: Run test to verify it passes**

Run: `pnpm --dir shipyard test -- tests/target-manager.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add shipyard/src/tools/target-manager/enrich-target.ts shipyard/tests/target-manager.test.ts
git commit -m "feat(target-manager): implement enrich_target tool with context builder"
```

---

### Task 8: Define target manager phase and barrel export

**Files:**
- Create: `shipyard/src/tools/target-manager/index.ts`
- Create: `shipyard/src/phases/target-manager/index.ts`
- Create: `shipyard/src/phases/target-manager/prompts.ts`

**Step 1: Write the failing test**

Add to `shipyard/tests/target-manager.test.ts`:

```typescript
import { getTool } from "../src/tools/registry.js";

describe("target manager phase", () => {
  it("registers all four tools in the tool registry", async () => {
    await import("../src/tools/target-manager/index.js");

    expect(getTool("list_targets")).toBeDefined();
    expect(getTool("select_target")).toBeDefined();
    expect(getTool("create_target")).toBeDefined();
    expect(getTool("enrich_target")).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --dir shipyard test -- tests/target-manager.test.ts`
Expected: FAIL — barrel export not found.

**Step 3: Write minimal implementation**

Create `shipyard/src/tools/target-manager/index.ts`:

```typescript
import "./list-targets.js";
import "./select-target.js";
import "./create-target.js";
import "./enrich-target.js";

export { listTargetsTool, type TargetListEntry } from "./list-targets.js";
export { selectTargetTool, type SelectTargetResult } from "./select-target.js";
export { createTargetTool, type CreateTargetResult } from "./create-target.js";
export {
  enrichTargetTool,
  buildEnrichmentContext,
  buildEnrichmentPrompt,
  parseEnrichmentResponse,
} from "./enrich-target.js";
export { loadTargetProfile, saveTargetProfile } from "./profile-io.js";
export { getScaffoldFiles, SCAFFOLD_TYPES, type ScaffoldType } from "./scaffolds.js";
```

Create `shipyard/src/phases/target-manager/prompts.ts`:

```typescript
export const TARGET_MANAGER_SYSTEM_PROMPT = `You are the Shipyard target manager. Your job is to help the user select an existing project target or create a new one.

Available tools:
- list_targets: Scan a directory for available project targets.
- select_target: Validate and select a target directory.
- create_target: Create a new target with scaffold files.
- enrich_target: Run AI analysis to generate a project profile.

Workflow:
1. Start by listing available targets with list_targets.
2. If the user wants an existing target, use select_target.
3. If the user wants a new target, ask for a name, description, and scaffold type, then use create_target.
4. After selection or creation, offer to run enrich_target for AI-generated project insights.
5. Once a target is confirmed, call select_target to finalize the selection.

Keep responses concise and action-oriented. Do not explain what tools do — just use them.`;
```

Create `shipyard/src/phases/target-manager/index.ts`:

```typescript
import "../../tools/target-manager/index.js";
import type { Phase } from "../phase.js";
import {
  getAnthropicTools,
  getTools,
  type AnthropicToolDefinition,
  type ToolDefinition,
} from "../../tools/registry.js";
import { TARGET_MANAGER_SYSTEM_PROMPT } from "./prompts.js";

export const TARGET_MANAGER_TOOL_NAMES = [
  "list_targets",
  "select_target",
  "create_target",
  "enrich_target",
];

export const targetManagerPhase: Phase = {
  name: "target-manager",
  description: "Interactive target selection, creation, and AI enrichment.",
  systemPrompt: TARGET_MANAGER_SYSTEM_PROMPT,
  tools: TARGET_MANAGER_TOOL_NAMES,
  approvalRequired: false,
  inputArtifact: "user_intent",
  outputArtifact: "target_selection",
};

export function createTargetManagerPhase(): Phase {
  return targetManagerPhase;
}

export function getTargetManagerToolDefinitions(): ToolDefinition[] {
  return getTools(TARGET_MANAGER_TOOL_NAMES);
}

export function getTargetManagerAnthropicTools(): AnthropicToolDefinition[] {
  return getAnthropicTools(TARGET_MANAGER_TOOL_NAMES);
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --dir shipyard test -- tests/target-manager.test.ts`
Expected: PASS

**Step 5: Run full validation**

Run: `pnpm --dir shipyard typecheck && pnpm --dir shipyard test && pnpm --dir shipyard build`
Expected: All pass.

**Step 6: Commit**

```bash
git add shipyard/src/tools/target-manager/index.ts shipyard/src/phases/target-manager/ shipyard/tests/target-manager.test.ts
git commit -m "feat(target-manager): define phase, system prompt, and barrel exports"
```

---

### Task 9: Add `targetProfile` to `SessionState`

**Files:**
- Modify: `shipyard/src/engine/state.ts:10-19`

**Step 1: Write the failing test**

Add to `shipyard/tests/target-manager.test.ts`:

```typescript
import { createSessionState, type SessionState } from "../src/engine/state.js";

describe("SessionState with targetProfile", () => {
  it("creates session state with optional targetProfile", () => {
    const state = createSessionState({
      sessionId: "test-123",
      targetDirectory: "/tmp/test",
      discovery: {
        isGreenfield: true, language: null, framework: null,
        packageManager: null, scripts: {}, hasReadme: false,
        hasAgentsMd: false, topLevelFiles: [], topLevelDirectories: [],
        projectName: null,
      },
    });

    expect(state.targetProfile).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --dir shipyard test -- tests/target-manager.test.ts`
Expected: FAIL — `targetProfile` property does not exist on `SessionState`.

**Step 3: Write minimal implementation**

Modify `shipyard/src/engine/state.ts`:

Add to `SessionState` interface (after line 18):
```typescript
  targetProfile?: TargetProfile;
```

Add import at top:
```typescript
import type { DiscoveryReport, TargetProfile } from "../artifacts/types.js";
```

(Remove the existing `DiscoveryReport`-only import.)

Add to `SessionSnapshot` interface too:
```typescript
  targetProfile?: TargetProfile;
```

Add to `createSessionSnapshot`:
```typescript
  targetProfile: state.targetProfile,
```

**Step 4: Run test to verify it passes**

Run: `pnpm --dir shipyard test -- tests/target-manager.test.ts`
Expected: PASS

**Step 5: Run full validation**

Run: `pnpm --dir shipyard typecheck && pnpm --dir shipyard test`
Expected: All pass.

**Step 6: Commit**

```bash
git add shipyard/src/engine/state.ts shipyard/tests/target-manager.test.ts
git commit -m "feat(target-manager): add optional targetProfile to SessionState"
```

---

## Story 2: PTM-S02 — CLI Integration & Runtime Switching

### Task 10: Make `--target` optional and add `--targets-dir`

**Files:**
- Modify: `shipyard/src/bin/shipyard.ts:44-67`

**Step 1: Write the failing test**

Add to `shipyard/tests/target-manager.test.ts`:

```typescript
import { parseArgs } from "../src/bin/shipyard.js";

describe("CLI argument parsing", () => {
  it("parses --target as optional", () => {
    const options = parseArgs(["--targets-dir", "/tmp/targets"]);
    expect(options.targetPath).toBeUndefined();
    expect(options.targetsDir).toBe("/tmp/targets");
  });

  it("still accepts --target for backward compatibility", () => {
    const options = parseArgs(["--target", "/tmp/my-project"]);
    expect(options.targetPath).toBe("/tmp/my-project");
  });

  it("defaults --targets-dir to ./test-targets", () => {
    const options = parseArgs([]);
    expect(options.targetsDir).toBe("./test-targets");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --dir shipyard test -- tests/target-manager.test.ts`
Expected: FAIL — Commander exits with error because `--target` is currently required.

**Step 3: Write minimal implementation**

Modify `shipyard/src/bin/shipyard.ts`:

Change `CliOptions` interface:
```typescript
export interface CliOptions {
  targetPath?: string;
  targetsDir: string;
  sessionId?: string;
  ui: boolean;
}
```

Change `parseArgs`:
```typescript
export function parseArgs(argv: string[]): CliOptions {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const program = new Command();

  program
    .name("shipyard")
    .description("Persistent coding-agent CLI")
    .option("--target <path>", "Path to the target repository")
    .option(
      "--targets-dir <path>",
      "Directory containing target repos",
      "./test-targets",
    )
    .option("--session <id>", "Resume a saved session by ID")
    .option("--ui", "Start the browser-based developer UI runtime")
    .parse(normalizedArgv, { from: "user" });

  const options = program.opts<{
    target?: string;
    targetsDir: string;
    session?: string;
    ui?: boolean;
  }>();

  return {
    targetPath: options.target,
    targetsDir: options.targetsDir,
    sessionId: options.session,
    ui: options.ui ?? false,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --dir shipyard test -- tests/target-manager.test.ts`
Expected: PASS

**Step 5: Run full validation** (ensure existing tests still pass)

Run: `pnpm --dir shipyard typecheck && pnpm --dir shipyard test`
Expected: All pass (may need to update other tests that call `parseArgs` with required `--target`).

**Step 6: Commit**

```bash
git add shipyard/src/bin/shipyard.ts shipyard/tests/target-manager.test.ts
git commit -m "feat(target-manager): make --target optional, add --targets-dir flag"
```

---

### Task 11: Implement `switchTarget()` in state.ts

**Files:**
- Modify: `shipyard/src/engine/state.ts`

**Step 1: Write the failing test**

Add to `shipyard/tests/target-manager.test.ts`:

```typescript
import { switchTarget } from "../src/engine/state.js";

describe("switchTarget", () => {
  it("saves old session and creates new one for new target", async () => {
    const oldDir = await mkdtemp(path.join(tmpdir(), "shipyard-old-"));
    const newDir = await mkdtemp(path.join(tmpdir(), "shipyard-new-"));
    tempDirs.push(oldDir, newDir);
    await ensureShipyardDirectories(oldDir);
    await ensureShipyardDirectories(newDir);

    const oldState = createSessionState({
      sessionId: "old-session",
      targetDirectory: oldDir,
      discovery: {
        isGreenfield: true, language: null, framework: null,
        packageManager: null, scripts: {}, hasReadme: false,
        hasAgentsMd: false, topLevelFiles: [], topLevelDirectories: [],
        projectName: null,
      },
    });
    oldState.turnCount = 5;

    const newState = await switchTarget(oldState, newDir);

    expect(newState.targetDirectory).toBe(newDir);
    expect(newState.turnCount).toBe(0);
    expect(newState.sessionId).not.toBe("old-session");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --dir shipyard test -- tests/target-manager.test.ts`
Expected: FAIL — `switchTarget` not exported.

**Step 3: Write minimal implementation**

Add to `shipyard/src/engine/state.ts`:

```typescript
import { nanoid } from "nanoid";
import { discoverTarget } from "../context/discovery.js";
import { loadTargetProfile } from "../tools/target-manager/profile-io.js";

export async function switchTarget(
  currentState: SessionState,
  newTargetPath: string,
): Promise<SessionState> {
  // Save current session
  await saveSessionState(currentState);

  // Prepare new target
  await mkdir(newTargetPath, { recursive: true });
  await ensureShipyardDirectories(newTargetPath);
  const discovery = await discoverTarget(newTargetPath);
  const profile = await loadTargetProfile(newTargetPath);

  // Create new session for the target
  const newState = createSessionState({
    sessionId: nanoid(),
    targetDirectory: newTargetPath,
    discovery,
  });

  if (profile) {
    newState.targetProfile = profile;
  }

  await saveSessionState(newState);
  return newState;
}
```

(Add `import { mkdir } from "node:fs/promises"` — already imported.)

**Step 4: Run test to verify it passes**

Run: `pnpm --dir shipyard test -- tests/target-manager.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add shipyard/src/engine/state.ts shipyard/tests/target-manager.test.ts
git commit -m "feat(target-manager): implement switchTarget for runtime target switching"
```

---

### Task 12: Add `target` REPL command to loop.ts

**Files:**
- Modify: `shipyard/src/engine/loop.ts:40-54` (printHelp) and `:191-318` (command handlers)

**Step 1: Implementation**

This task modifies the REPL loop which is hard to unit test in isolation. Implementation is straightforward command dispatch.

Add to `printHelp()`:
```typescript
console.log("  target              Show current target info");
console.log("  target switch       List targets and switch");
console.log("  target create       Create a new target");
console.log("  target enrich       Re-run AI enrichment");
console.log("  target profile      Print full TargetProfile JSON");
```

Add command handler block in the `for await` loop (before the `else` clause that treats input as an instruction):

```typescript
} else if (line === "target" || line.startsWith("target ")) {
  const subcommand = line === "target" ? "" : line.slice(7).trim();
  const { handleTargetCommand } = await import("./target-command.js");
  const result = await handleTargetCommand(subcommand, state, runtimeState, options);
  if (result?.switched) {
    // Update the state reference and runtimeState for the new target
    Object.assign(state, result.newState);
    runtimeState.projectRules = await loadProjectRules(state.targetDirectory);
    runtimeState.baseInjectedContext = [];
    runtimeState.recentToolOutputs = [];
    runtimeState.recentErrors = [];
  }
```

Create `shipyard/src/engine/target-command.ts` as a separate module to keep loop.ts clean. This file handles the subcommand dispatch, calling the tool functions from PTM-S01.

**Step 2: Run full validation**

Run: `pnpm --dir shipyard typecheck && pnpm --dir shipyard test && pnpm --dir shipyard build`
Expected: All pass.

**Step 3: Commit**

```bash
git add shipyard/src/engine/loop.ts shipyard/src/engine/target-command.ts
git commit -m "feat(target-manager): add target REPL command with switch/create/enrich/profile"
```

---

### Task 13: Update `main()` for target manager mode

**Files:**
- Modify: `shipyard/src/bin/shipyard.ts:88-171`

**Step 1: Implementation**

Modify `main()` to handle the case where `--target` is omitted:

```typescript
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const options = parseArgs(argv);

  if (options.targetPath) {
    // Existing behavior — direct target mode
    const resolvedTargetPath = path.resolve(process.cwd(), options.targetPath);
    // ... (existing code unchanged)
  } else {
    // Target manager mode — no target specified
    const resolvedTargetsDir = path.resolve(process.cwd(), options.targetsDir);
    await mkdir(resolvedTargetsDir, { recursive: true });

    console.log(chalk.green("Shipyard starting in target manager mode."));
    console.log(`Targets directory: ${resolvedTargetsDir}`);
    console.log("No --target specified. You can select or create a target.\n");

    // For now, launch the REPL without a target. The target command will be
    // used to select one. A placeholder session is needed.
    // Full target-manager-as-first-turn integration is wired here.
    // ... (run loop with target manager phase for first turn)
  }
}
```

**Step 2: Run full validation**

Run: `pnpm --dir shipyard typecheck && pnpm --dir shipyard test && pnpm --dir shipyard build`
Expected: All pass.

**Step 3: Commit**

```bash
git add shipyard/src/bin/shipyard.ts
git commit -m "feat(target-manager): launch target manager mode when --target is omitted"
```

---

### Task 14: Full validation and backward compatibility check

**Step 1: Run all tests**

Run: `pnpm --dir shipyard test`
Expected: All pass.

**Step 2: Type check**

Run: `pnpm --dir shipyard typecheck`
Expected: No errors.

**Step 3: Build**

Run: `pnpm --dir shipyard build`
Expected: Clean build.

**Step 4: Manual smoke test — backward compatibility**

Run: `node shipyard/dist/bin/shipyard.js --target ../test-targets/tic-tac-toe`
Expected: Behaves exactly as before.

**Step 5: Manual smoke test — target manager mode**

Run: `node shipyard/dist/bin/shipyard.js`
Expected: Enters target manager mode, lists targets, allows selection.

**Step 6: Commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(target-manager): address validation issues from full test run"
```

---

## Story 3: PTM-S03 — Browser Workbench Target UI

> **Note:** Story 3 involves React components and WebSocket contracts. The plan provides the contract shapes and component structure. Exact JSX and CSS will be implementation details driven by the existing workbench patterns in `ui/src/`.

### Task 15: Define WebSocket message schemas

**Files:**
- Modify: `shipyard/src/ui/contracts.ts`

Add Zod schemas for:
- `TargetManagerStateSchema` — `{ currentTarget: { path, name, profileSummary?, enrichmentStatus }, availableTargets: TargetListEntry[] }`
- `TargetSwitchRequestSchema` — `{ targetPath: string }`
- `TargetSwitchCompleteSchema` — `{ success: boolean, newState: TargetManagerState }`
- `EnrichmentProgressSchema` — `{ status: "started" | "in-progress" | "complete" | "error", message?: string }`

**Test:** Unit test schema validation with valid and invalid payloads.

**Commit:** `feat(target-manager): define WebSocket contracts for target manager events`

---

### Task 16: Add target manager fields to WorkbenchViewState

**Files:**
- Modify: `shipyard/src/ui/workbench-state.ts`

Add `targetManager?: { currentTarget, availableTargets, enrichmentStatus }` to the view state. Update `createInitialWorkbenchState()`.

**Test:** Unit test serialization/deserialization round-trip.

**Commit:** `feat(target-manager): add target manager fields to WorkbenchViewState`

---

### Task 17: Server-side target event handlers

**Files:**
- Modify: `shipyard/src/ui/server.ts`

- Emit `TargetManagerState` on WebSocket connect
- Handle `TargetSwitchRequest` → call `switchTarget()` → emit `TargetSwitchComplete`
- Stream `EnrichmentProgress` during enrichment

**Test:** Integration test: mock WebSocket, verify events emitted.

**Commit:** `feat(target-manager): emit target events from WebSocket server`

---

### Task 18: Build React components

**Files:**
- Create: `ui/src/components/TargetHeader.tsx`
- Create: `ui/src/components/TargetSwitcher.tsx`
- Create: `ui/src/components/TargetCreationDialog.tsx`
- Create: `ui/src/components/EnrichmentIndicator.tsx`

Follow existing workbench patterns. Wire into the main layout.

**Test:** Manual smoke test in browser.

**Commit:** `feat(target-manager): add target header, switcher, and enrichment UI components`

---

### Task 19: End-to-end browser validation

**Step 1:** Run `node shipyard/dist/bin/shipyard.js --ui`
**Step 2:** Open browser, verify target header shows
**Step 3:** Switch targets via UI
**Step 4:** Create new target via dialog
**Step 5:** Trigger enrichment, verify progress indicator

**Commit:** `fix(target-manager): polish browser target manager flow`

---

## Final Validation

Run all three checks:
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```

All must pass before the pack is considered complete.
