import type {
  CodeBrowserErrorResponse,
  CodeBrowserReadResponse,
  CodeBrowserTreeResponse,
} from "../../src/ui/contracts.js";
import {
  codeBrowserErrorResponseSchema,
  codeBrowserReadResponseSchema,
  codeBrowserTreeResponseSchema,
} from "../../src/ui/contracts.js";

export class CodeBrowserClientError extends Error {
  readonly statusCode: number;
  readonly code: CodeBrowserErrorResponse["code"];

  constructor(
    message: string,
    statusCode: number,
    code: CodeBrowserErrorResponse["code"] = undefined,
  ) {
    super(message);
    this.name = "CodeBrowserClientError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export interface CodeBrowserClient {
  loadTree(projectId: string): Promise<CodeBrowserTreeResponse>;
  readFile(
    projectId: string,
    filePath: string,
  ): Promise<CodeBrowserReadResponse>;
}

async function parseJsonResponse<T>(
  response: Response,
  schema: {
    parse: (value: unknown) => T;
  },
  fallbackMessage: string,
): Promise<T> {
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const parsedError = codeBrowserErrorResponseSchema.safeParse(payload);
    throw new CodeBrowserClientError(
      parsedError.success
        ? parsedError.data.error
        : fallbackMessage,
      response.status,
      parsedError.success ? parsedError.data.code : undefined,
    );
  }

  return schema.parse(payload);
}

export function createHttpCodeBrowserClient(): CodeBrowserClient {
  return {
    async loadTree(projectId) {
      const response = await fetch(
        `/api/files/tree?projectId=${encodeURIComponent(projectId)}`,
        {
          headers: {
            accept: "application/json",
          },
        },
      );

      return await parseJsonResponse(
        response,
        codeBrowserTreeResponseSchema,
        "Shipyard could not load the project file tree.",
      );
    },
    async readFile(projectId, filePath) {
      const response = await fetch(
        `/api/files/read?projectId=${encodeURIComponent(projectId)}&path=${encodeURIComponent(filePath)}`,
        {
          headers: {
            accept: "application/json",
          },
        },
      );

      return await parseJsonResponse(
        response,
        codeBrowserReadResponseSchema,
        `Shipyard could not read ${filePath}.`,
      );
    },
  };
}

export const defaultCodeBrowserClient = createHttpCodeBrowserClient();
