import { z } from "zod";

export const promptCommandNamePattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const PromptCommandFrontmatterSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(
      promptCommandNamePattern,
      "lowercase letters, numbers, hyphens only",
    ),
  description: z.string().min(1).max(1024),
  when_to_use: z.string().trim().min(1).max(2048).optional(),
  arguments: z.string().trim().min(1).max(1024).optional(),
  user_invocable: z.boolean().optional(),
  model_invocable: z.boolean().optional(),
});

export type PromptCommandInvocationSource = "slash" | "tool";

export interface PromptCommandDefinition {
  name: string;
  description: string;
  whenToUse: string;
  usage: string | null;
  type: "prompt";
  userInvocable: boolean;
  modelInvocable: boolean;
  sourcePath: string;
  sourceDir: string;
}

export const StoredPromptCommandInvocationSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(promptCommandNamePattern),
  args: z.string(),
  source: z.literal("slash"),
  type: z.literal("prompt"),
  expandedPrompt: z.string().min(1),
});

export type StoredPromptCommandInvocation = z.infer<
  typeof StoredPromptCommandInvocationSchema
>;

export const PublicPromptCommandInvocationSchema =
  StoredPromptCommandInvocationSchema.omit({
    expandedPrompt: true,
  });

export type PublicPromptCommandInvocation = z.infer<
  typeof PublicPromptCommandInvocationSchema
>;

export type LeadingSlashCommandParseResult =
  | {
      kind: "plain";
    }
  | {
      kind: "error";
      message: string;
    }
  | {
      kind: "command";
      command: PromptCommandDefinition;
      args: string;
    };
