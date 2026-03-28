export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  data?: unknown;
}

export interface JsonSchemaProperty {
  type?: "string" | "number" | "integer" | "boolean" | "array" | "object";
  description?: string;
  enum?: string[];
  anyOf?: JsonSchemaProperty[];
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ToolInputSchema {
  type: "object";
  description?: string;
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ToolExecutionContext {
  signal?: AbortSignal;
}

export interface ToolDefinition<Input = any> {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  execute: (
    input: Input,
    targetDirectory: string,
    context?: ToolExecutionContext,
  ) => Promise<ToolResult>;
}

interface RegisteredToolRecord {
  definition: ToolDefinition<any>;
  ownerId: string | null;
}

const registeredTools = new Map<string, RegisteredToolRecord>();

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ensureValidInputSchema(
  toolName: string,
  inputSchema: unknown,
): asserts inputSchema is ToolInputSchema {
  if (!isPlainObject(inputSchema)) {
    throw new Error(`Failed to register tool "${toolName}": inputSchema must be an object.`);
  }

  if (inputSchema.type !== "object") {
    throw new Error(
      `Failed to register tool "${toolName}": inputSchema.type must be "object".`,
    );
  }

  if (!isPlainObject(inputSchema.properties)) {
    throw new Error(
      `Failed to register tool "${toolName}": inputSchema.properties must be an object.`,
    );
  }

  if (
    inputSchema.required !== undefined &&
    !Array.isArray(inputSchema.required)
  ) {
    throw new Error(
      `Failed to register tool "${toolName}": inputSchema.required must be an array of strings.`,
    );
  }
}

function ensureValidDefinition(definition: ToolDefinition<any>): void {
  const name = definition.name.trim();

  if (!name) {
    throw new Error('Failed to register tool: tool name must not be empty.');
  }

  if (!definition.description.trim()) {
    throw new Error(
      `Failed to register tool "${name}": description must not be empty.`,
    );
  }

  ensureValidInputSchema(name, definition.inputSchema);

  if (typeof definition.execute !== "function") {
    throw new Error(
      `Failed to register tool "${name}": execute must be a function.`,
    );
  }
}

export function validateToolDefinition<Input>(
  definition: ToolDefinition<Input>,
): void {
  ensureValidDefinition(definition);
}

export function registerTool<Input>(
  definition: ToolDefinition<Input>,
  options: {
    ownerId?: string | null;
  } = {},
): void {
  validateToolDefinition(definition);

  if (registeredTools.has(definition.name)) {
    throw new Error(
      `Failed to register tool "${definition.name}": duplicate tool name.`,
    );
  }

  registeredTools.set(definition.name, {
    definition,
    ownerId: options.ownerId?.trim() || null,
  });
}

export function getTool(name: string): ToolDefinition<any> | undefined {
  return registeredTools.get(name)?.definition;
}

export function getTools(names: string[]): ToolDefinition<any>[] {
  return names
    .map((name) => registeredTools.get(name)?.definition)
    .filter((tool): tool is ToolDefinition<any> => tool !== undefined);
}

export function unregisterTool(
  name: string,
  options: {
    ownerId?: string | null;
  } = {},
): boolean {
  const record = registeredTools.get(name);

  if (!record) {
    return false;
  }

  if (
    options.ownerId !== undefined
    && record.ownerId !== (options.ownerId?.trim() || null)
  ) {
    return false;
  }

  registeredTools.delete(name);
  return true;
}

export function unregisterToolsByOwner(ownerId: string): string[] {
  const normalizedOwnerId = ownerId.trim();

  if (!normalizedOwnerId) {
    return [];
  }

  const removed: string[] = [];

  for (const [toolName, record] of registeredTools.entries()) {
    if (record.ownerId === normalizedOwnerId) {
      registeredTools.delete(toolName);
      removed.push(toolName);
    }
  }

  return removed;
}

export function getToolOwnerId(name: string): string | null {
  return registeredTools.get(name)?.ownerId ?? null;
}

export function createToolSuccessResult(
  output: unknown,
  data?: unknown,
): ToolResult {
  return {
    success: true,
    output:
      typeof output === "string" ? output : JSON.stringify(output, null, 2),
    ...(data === undefined ? {} : { data }),
  };
}

export function createToolErrorResult(
  error: unknown,
  data?: unknown,
): ToolResult {
  const message = error instanceof Error ? error.message : String(error);

  return {
    success: false,
    output: "",
    error: message,
    ...(data === undefined ? {} : { data }),
  };
}
