import { z } from "zod";

import type { ToolDefinition } from "../types";

export const structuredOutputParams = z.object({
  contract_id: z
    .string()
    .min(1)
    .describe("Artifact contract id, for example repo-risk-report@v1"),
  instruction: z
    .string()
    .optional()
    .describe("Optional extra instruction for this structured artifact generation"),
});

export const structuredOutputToolName = "structured_output";

export const structuredOutputTool: ToolDefinition<
  z.infer<typeof structuredOutputParams>
> = {
  name: structuredOutputToolName,
  description:
    "Generate a validated JSON artifact for a registered contract id. Use this after collecting enough context with tools such as bash or read.",
  riskLevel: "low",
  parameters: structuredOutputParams,
  async execute() {
    throw new Error("structured_output is a runtime-native capability");
  },
};
