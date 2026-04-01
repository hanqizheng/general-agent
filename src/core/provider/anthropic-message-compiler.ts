import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";

import type { LLMContentBlock, LLMMessage } from "./base";
import { artifactPayloadToContextText } from "@/lib/artifact-types";
import {
  ATTACHMENT_BINDING_METHOD,
  ATTACHMENT_PROVIDER,
} from "@/lib/attachment-constants";

type LangChainMessage = HumanMessage | AIMessage | ToolMessage | SystemMessage;

interface AnthropicMessageCompileOptions {
  enableDocumentCitations?: boolean;
}

function toAnthropicDocumentBlock(
  block: Extract<LLMContentBlock, { type: "attachment" }>,
  options?: AnthropicMessageCompileOptions,
) {
  if (!block.source || block.source.provider !== ATTACHMENT_PROVIDER.ANTHROPIC) {
    throw new Error(
      `Attachment ${block.attachmentId} is missing an Anthropic binding source`,
    );
  }

  let source: Record<string, unknown>;

  switch (block.source.bindingMethod) {
    case ATTACHMENT_BINDING_METHOD.PROVIDER_FILE_ID:
      source = {
        type: "file",
        file_id: block.source.remoteRef,
      };
      break;
    case ATTACHMENT_BINDING_METHOD.PROVIDER_URL:
      source = {
        type: "url",
        url: block.source.remoteRef,
      };
      break;
    case ATTACHMENT_BINDING_METHOD.INLINE_BASE64:
      source = {
        type: "base64",
        media_type: block.mimeType,
        data: block.source.remoteRef,
      };
      break;
    default:
      throw new Error(
        `Unsupported Anthropic attachment binding method: ${block.source.bindingMethod}`,
      );
  }

  return {
    type: "document",
    source,
    title: block.originalName,
    ...(options?.enableDocumentCitations === false
      ? {}
      : {
          citations: {
            enabled: true,
          },
        }),
  };
}

export function toAnthropicMessages(
  messages: LLMMessage[],
  systemPrompt?: string,
  options?: AnthropicMessageCompileOptions,
): LangChainMessage[] {
  const result: LangChainMessage[] = [];

  if (systemPrompt) {
    result.push(new SystemMessage(systemPrompt));
  }

  for (const message of messages) {
    if (message.role === "user") {
      const humanBlocks: Record<string, unknown>[] = [];

      for (const block of message.content) {
        if (block.type === "text") {
          humanBlocks.push({
            type: "text",
            text: block.text,
          });
          continue;
        }

        if (block.type === "attachment") {
          humanBlocks.push(toAnthropicDocumentBlock(block, options));
          continue;
        }

        if (block.type === "tool_result") {
          if (humanBlocks.length > 0) {
            result.push(new HumanMessage({ content: humanBlocks as never }));
            humanBlocks.length = 0;
          }

          result.push(
            new ToolMessage({
              content: block.content,
              tool_call_id: block.toolCallId,
              status: block.isError ? "error" : "success",
            }),
          );
        }
      }

      if (humanBlocks.length > 0) {
        result.push(new HumanMessage({ content: humanBlocks as never }));
      }

      continue;
    }

    const contentBlocks: Record<string, unknown>[] = [];
    const toolCalls: {
      id: string;
      name: string;
      args: Record<string, unknown>;
    }[] = [];

    for (const block of message.content) {
      if (block.type === "text") {
        contentBlocks.push({
          type: "text",
          text: block.text,
        });
        continue;
      }

      if (block.type === "artifact") {
        contentBlocks.push({
          type: "text",
          text: artifactPayloadToContextText(block),
        });
        continue;
      }

      if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          args: block.input,
        });
      }
    }

    result.push(
      new AIMessage({
        content: contentBlocks as never,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      }),
    );
  }

  return result;
}
