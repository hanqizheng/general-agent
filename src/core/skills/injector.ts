import fs from "fs/promises";
import matter from "gray-matter";

import type { LLMContentBlock } from "@/core/provider/base";

import {
  PublicPromptCommandInvocationSchema,
  StoredPromptCommandInvocationSchema,
  promptCommandNamePattern,
  type LeadingSlashCommandParseResult,
  type PromptCommandDefinition,
  type PromptCommandInvocationSource,
  type PublicPromptCommandInvocation,
  type StoredPromptCommandInvocation,
} from "./types";

function escapeXml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function replaceSkillDirPlaceholders(
  value: string,
  command: PromptCommandDefinition,
) {
  return value.split("<this-skill-dir>").join(command.sourceDir);
}

export function buildCommandsXml(commands: PromptCommandDefinition[]) {
  if (commands.length === 0) {
    return "";
  }

  const entries = commands.map((command) => {
    const attrs = [
      `name="${escapeXml(command.name)}"`,
      command.usage ? `usage="${escapeXml(command.usage)}"` : null,
    ]
      .filter(Boolean)
      .join(" ");

    return [
      `<command ${attrs}>`,
      `<description>${escapeXml(command.description)}</description>`,
      `<when-to-use>${escapeXml(command.whenToUse)}</when-to-use>`,
      `</command>`,
    ].join("\n");
  });

  return [
    "The following prompt commands are available through the `skill` tool.",
    "<available-prompt-commands>",
    entries.join("\n"),
    "</available-prompt-commands>",
  ].join("\n");
}

export async function expandPromptCommand(
  command: PromptCommandDefinition,
  args: string,
  source: PromptCommandInvocationSource,
) {
  const raw = await fs.readFile(command.sourcePath, "utf-8");
  const { content } = matter(raw);
  const body = replaceSkillDirPlaceholders(content.trim(), command);

  return [
    `<prompt-command name="${escapeXml(command.name)}" source="${source}" type="prompt">`,
    `<arguments>${escapeXml(args)}</arguments>`,
    `<body>${escapeXml(body)}</body>`,
    "</prompt-command>",
    "Apply the above prompt command to the current task.",
  ].join("\n");
}

export function parseLeadingSlashCommand(
  text: string,
  commands: PromptCommandDefinition[],
): LeadingSlashCommandParseResult {
  const firstNonWhitespaceIndex = text.search(/\S/);
  if (firstNonWhitespaceIndex === -1 || text[firstNonWhitespaceIndex] !== "/") {
    return { kind: "plain" };
  }

  let tokenEnd = firstNonWhitespaceIndex + 1;
  while (tokenEnd < text.length && !/\s/.test(text[tokenEnd] ?? "")) {
    tokenEnd += 1;
  }

  const commandToken = text.slice(firstNonWhitespaceIndex + 1, tokenEnd);
  if (!promptCommandNamePattern.test(commandToken)) {
    return { kind: "plain" };
  }

  const command = commands.find((entry) => entry.name === commandToken);
  if (!command) {
    return { kind: "plain" };
  }

  if (!command.userInvocable) {
    return {
      kind: "error",
      message: `Command is not user-invocable: ${command.name}`,
    };
  }

  return {
    kind: "command",
    command,
    args: text.slice(tokenEnd).replace(/^\s+/, ""),
  };
}

export function readStoredPromptCommandInvocations(
  metadata: Record<string, unknown> | null | undefined,
): StoredPromptCommandInvocation[] {
  if (!metadata || typeof metadata !== "object") {
    return [];
  }

  const raw = metadata.commandInvocations;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.flatMap((entry) => {
    const parsed = StoredPromptCommandInvocationSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

export function projectPublicPromptCommandInvocations(
  metadata: Record<string, unknown> | null | undefined,
): PublicPromptCommandInvocation[] {
  return readStoredPromptCommandInvocations(metadata).flatMap((entry) => {
    const parsed = PublicPromptCommandInvocationSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

export function writePromptCommandMetadata(
  metadata: Record<string, unknown> | null | undefined,
  invocations: StoredPromptCommandInvocation[],
) {
  return {
    ...(metadata ?? {}),
    commandInvocations: invocations,
  };
}

export function prependExpandedPromptCommands(
  content: LLMContentBlock[],
  invocations: StoredPromptCommandInvocation[],
): LLMContentBlock[] {
  if (invocations.length === 0) {
    return content;
  }

  const promptPrefix = invocations
    .map((invocation) => invocation.expandedPrompt)
    .join("\n\n");

  const blocks = [...content];
  const firstTextIndex = blocks.findIndex((block) => block.type === "text");

  if (firstTextIndex === -1) {
    return [
      {
        type: "text",
        text: promptPrefix,
      },
      ...blocks,
    ];
  }

  const firstTextBlock = blocks[firstTextIndex];
  if (firstTextBlock?.type !== "text") {
    return blocks;
  }

  blocks[firstTextIndex] = {
    type: "text",
    text: `${promptPrefix}\n\n${firstTextBlock.text}`,
  };

  return blocks;
}
