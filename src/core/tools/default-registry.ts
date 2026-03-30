import { ToolRegistry } from "./registry";
import { bashTool } from "./built-in/bash";
import { editTool } from "./built-in/edit";
import { globTool } from "./built-in/glob";
import { grepTool } from "./built-in/grep";
import { readTool } from "./built-in/read";
import { createWebSearchTool } from "./built-in/web-search";
import { writeTool } from "./built-in/write";
import { structuredOutputTool } from "./built-in/structured-output";

import { env } from "@/lib/config";

export function createDefaultToolRegistry() {
  const toolRegistry = new ToolRegistry();
  toolRegistry.register(readTool);
  toolRegistry.register(writeTool);
  toolRegistry.register(editTool);
  toolRegistry.register(bashTool);
  toolRegistry.register(grepTool);
  toolRegistry.register(globTool);
  toolRegistry.register(structuredOutputTool);

  if (env.GEMINI_API_KEY) {
    toolRegistry.register(
      createWebSearchTool({
        apiKey: env.GEMINI_API_KEY,
        ...(env.WEB_SEARCH_TIMEOUT_MS
          ? { timeoutMs: env.WEB_SEARCH_TIMEOUT_MS }
          : {}),
        ...(env.WEB_SEARCH_MAX_RETRIES !== undefined
          ? { maxRetries: env.WEB_SEARCH_MAX_RETRIES }
          : {}),
      }),
    );
  }

  return toolRegistry;
}
