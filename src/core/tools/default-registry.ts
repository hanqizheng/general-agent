import { ToolRegistry } from "./registry";
import { bashTool } from "./built-in/bash";
import { editTool } from "./built-in/edit";
import { globTool } from "./built-in/glob";
import { grepTool } from "./built-in/grep";
import { readTool } from "./built-in/read";
import { createSkillTool } from "./built-in/skill";
import { createWebSearchTool } from "./built-in/web-search";
import { writeTool } from "./built-in/write";
import { structuredOutputTool } from "./built-in/structured-output";

import type { PromptCommandDefinition } from "@/core/skills";
import { env } from "@/lib/config";

interface CreateDefaultToolRegistryOptions {
  commands?: PromptCommandDefinition[];
}

export function createDefaultToolRegistry(
  options: CreateDefaultToolRegistryOptions = {},
) {
  const toolRegistry = new ToolRegistry();
  toolRegistry.register(readTool);
  toolRegistry.register(writeTool);
  toolRegistry.register(editTool);
  toolRegistry.register(bashTool);
  toolRegistry.register(grepTool);
  toolRegistry.register(globTool);
  toolRegistry.register(structuredOutputTool);

  if (options.commands?.some((command) => command.modelInvocable)) {
    toolRegistry.register(createSkillTool(options.commands));
  }

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
