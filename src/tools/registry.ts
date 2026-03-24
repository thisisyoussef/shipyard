import { editBlockDefinition } from "./edit-block.js";
import { gitDiffDefinition } from "./git-diff.js";
import { listFilesDefinition } from "./list-files.js";
import { readFileDefinition } from "./read-file.js";
import { runCommandDefinition } from "./run-command.js";
import { searchFilesDefinition } from "./search-files.js";
import { writeFileDefinition } from "./write-file.js";

export interface ToolDefinition<Input = unknown, Output = unknown> {
  name: string;
  description: string;
  invoke: (input: Input) => Promise<Output>;
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition<any, any>>();

  register(tool: ToolDefinition<any, any>): void {
    this.tools.set(tool.name, tool);
  }

  list(): ToolDefinition<any, any>[] {
    return [...this.tools.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }

  get(name: string): ToolDefinition<any, any> | undefined {
    return this.tools.get(name);
  }

  async execute<Input, Output>(
    name: string,
    input: Input,
  ): Promise<Output> {
    const tool = this.tools.get(name) as ToolDefinition<Input, Output> | undefined;

    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    return tool.invoke(input);
  }
}

export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  const tools = [
    readFileDefinition,
    writeFileDefinition,
    editBlockDefinition,
    listFilesDefinition,
    searchFilesDefinition,
    runCommandDefinition,
    gitDiffDefinition,
  ];

  for (const tool of tools) {
    registry.register(tool);
  }

  return registry;
}
