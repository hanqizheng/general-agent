import fs from "fs/promises";
import path from "path";
import fg from "fast-glob";
import matter from "gray-matter";

import { createLogger } from "@/lib/logger";

import {
  PromptCommandFrontmatterSchema,
  type PromptCommandDefinition,
} from "./types";

const logger = createLogger("prompt-command-loader");

export async function loadCommands(
  commandsRoot: string,
): Promise<PromptCommandDefinition[]> {
  try {
    await fs.access(commandsRoot);
  } catch {
    logger.debug("Commands directory not found, skipping", { commandsRoot });
    return [];
  }

  const files = await fg("**/SKILL.md", {
    cwd: commandsRoot,
    absolute: true,
    onlyFiles: true,
  });

  if (files.length === 0) {
    logger.debug("No SKILL.md files found");
    return [];
  }

  const commands: PromptCommandDefinition[] = [];

  for (const sourcePath of files) {
    try {
      const raw = await fs.readFile(sourcePath, "utf-8");
      const { data } = matter(raw);
      const result = PromptCommandFrontmatterSchema.safeParse(data);

      if (!result.success) {
        logger.warn(`Invalid SKILL.md: ${sourcePath}`, {
          errors: result.error.issues,
        });
        continue;
      }

      commands.push({
        name: result.data.name,
        description: result.data.description,
        whenToUse: result.data.when_to_use?.trim() ?? result.data.description,
        usage: result.data.arguments?.trim() ?? null,
        type: "prompt",
        userInvocable: result.data.user_invocable ?? true,
        modelInvocable: result.data.model_invocable ?? true,
        sourcePath,
        sourceDir: path.dirname(sourcePath),
      });

      logger.debug(`Loaded command: ${result.data.name}`);
    } catch (error) {
      logger.warn(`Failed to parse SKILL.md: ${sourcePath}`, {
        error: (error as Error).message,
      });
    }
  }

  return commands.sort((left, right) => left.name.localeCompare(right.name));
}
