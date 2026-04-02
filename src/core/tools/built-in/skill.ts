import { z } from "zod";

import {
  expandPromptCommand,
  type PromptCommandDefinition,
} from "@/core/skills";
import type { ToolDefinition } from "../types";

const skillParams = z.object({
  skill: z
    .string()
    .min(1)
    .describe("Exact prompt command name to load"),
  args: z
    .string()
    .optional()
    .describe("Optional free-form arguments to pass to the prompt command"),
});

export function createSkillTool(
  commands: PromptCommandDefinition[],
): ToolDefinition<z.infer<typeof skillParams>> {
  const modelInvocableCommands = commands.filter((command) => command.modelInvocable);
  const commandMap = new Map(
    modelInvocableCommands.map((command) => [command.name, command]),
  );

  return {
    name: "skill",
    description:
      "Load a prompt command by exact name and return its expanded instructions. Use this when a listed prompt command clearly matches the current task. Do not guess command names.",
    riskLevel: "low",
    concurrencySafe: false,
    parameters: skillParams,

    async execute(input) {
      const command = commandMap.get(input.skill);
      if (!command) {
        return {
          output: `Unknown or non-invocable prompt command: ${input.skill}`,
          isError: true,
        };
      }

      return {
        output: await expandPromptCommand(command, input.args ?? "", "tool"),
        isError: false,
      };
    },
  };
}
