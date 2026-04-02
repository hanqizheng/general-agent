// Anthropic provider — standard Anthropic API format

import { ChatAnthropic } from "@langchain/anthropic";
import type { AIMessageChunk } from "@langchain/core/messages";
import type {
  LLMProvider,
  LLMStreamParams,
  LLMStreamChunk,
  LLMToolDefinition,
} from "./base";
import { toAnthropicMessages } from "./anthropic-message-compiler";

interface AnthropicProviderOptions {
  apiKey: string;
  baseURL: string;
  model?: string;
}

export function createAnthropicProvider(
  options: AnthropicProviderOptions,
): LLMProvider {
  const {
    apiKey,
    baseURL,
    model: defaultModel = "claude-opus-4-6-v1",
  } = options;

  return {
    name: "anthropic",

    async stream(
      params: LLMStreamParams,
    ): Promise<AsyncIterable<LLMStreamChunk>> {
      const { messages, systemPrompt, tools, temperature, maxTokens, signal } =
        params;

      const llm = new ChatAnthropic({
        apiKey,
        anthropicApiUrl: baseURL,
        model: defaultModel,
        maxTokens: maxTokens ?? 4096,
        temperature: temperature ?? 0,
        streaming: true,
        streamUsage: true,
      });

      // 转换消息格式
      const langChainMessages = toAnthropicMessages(messages, systemPrompt);

      // 构建调用参数
      const callOptions: Record<string, unknown> = {};

      // 绑定 tools（如果有）
      const llmWithTools =
        tools && tools.length > 0
          ? llm.bindTools(tools.map(toLangChainTool))
          : llm;

      // 获取流
      const stream = await llmWithTools.stream(langChainMessages, {
        ...callOptions,
        signal,
      });

      return transformStream(stream);
    },
  };
}

/** 将我们的 LLMToolDefinition 转成 LangChain 的 tool 格式 */
function toLangChainTool(tool: LLMToolDefinition) {
  return {
    name: tool.name,
    description: tool.description,
    schema: tool.inputSchema,
  };
}

/** 将 LangChain 的 AIMessageChunk 流转成我们的 LLMStreamChunk 流 */
async function* transformStream(
  stream: AsyncIterable<AIMessageChunk>,
): AsyncIterable<LLMStreamChunk> {
  // 累积所有 chunk，用于最终提取完整的 tool calls
  // LangChain 流式传输 tool call 时参数是增量到达的，单个 chunk 的 args 可能是空对象，
  // 只有累积后的完整消息才有完整参数
  let accumulated: AIMessageChunk | null = null;

  for await (const chunk of stream) {
    accumulated = accumulated ? accumulated.concat(chunk) : chunk;

    // 文本 — 实时流式输出
    if (typeof chunk.content === "string" && chunk.content.length > 0) {
      yield { type: "text_delta", text: chunk.content };
    } else if (Array.isArray(chunk.content)) {
      for (const block of chunk.content) {
        if (typeof block === "object" && block !== null) {
          const b = block as Record<string, unknown>;
          if (
            b.type === "text" &&
            typeof b.text === "string" &&
            b.text.length > 0
          ) {
            yield { type: "text_delta", text: b.text };
          } else if (
            b.type === "thinking" &&
            typeof b.thinking === "string" &&
            b.thinking.length > 0
          ) {
            yield { type: "reasoning_delta", text: b.thinking };
          }
        }
      }
    }

    // Token 使用量 — 实时输出
    if (chunk.usage_metadata) {
      yield {
        type: "usage",
        inputTokens: chunk.usage_metadata.input_tokens,
        outputTokens: chunk.usage_metadata.output_tokens,
      };
    }
  }

  // stream 结束后，从累积的完整消息中提取 tool calls（此时 args 完整）
  if (accumulated?.tool_calls && accumulated.tool_calls.length > 0) {
    for (const tc of accumulated.tool_calls) {
      if (tc.name && tc.id) {
        yield {
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: (tc.args ?? {}) as Record<string, unknown>,
        };
      }
    }
  }

  if (Array.isArray(accumulated?.content)) {
    const blocks: Array<{
      blockIndex: number;
      annotations: import("@/lib/attachment-types").AttachmentCitationAnnotation[];
    }> = [];
    let textBlockIndex = 0;

    for (const block of accumulated.content) {
      if (
        typeof block === "object" &&
        block !== null &&
        "type" in block &&
        block.type === "text"
      ) {
        const blockRecord = block as {
          citations?: Array<Record<string, unknown>> | null;
        };

        const annotations = (blockRecord.citations ?? [])
          .map((citation) => normalizeCitation(citation))
          .filter(
            (
              annotation,
            ): annotation is import("@/lib/attachment-types").AttachmentCitationAnnotation =>
              annotation !== null,
          );

        if (annotations.length > 0) {
          blocks.push({
            blockIndex: textBlockIndex,
            annotations,
          });
        }

        textBlockIndex += 1;
      }
    }

    if (blocks.length > 0) {
      yield {
        type: "text_annotations",
        blocks,
      };
    }
  }

  // 提取 stop reason —— Anthropic 通过 additional_kwargs.stop_reason 暴露
  const stopReason =
    (accumulated?.additional_kwargs as { stop_reason?: string } | undefined)
      ?.stop_reason ??
    (accumulated?.response_metadata as { stop_reason?: string } | undefined)
      ?.stop_reason;

  if (stopReason) {
    yield { type: "stop", stopReason };
  }
}

function normalizeCitation(citation: Record<string, unknown>) {
  if (citation.type !== "page_location") {
    return null;
  }

  const startPageNumber =
    typeof citation.start_page_number === "number"
      ? citation.start_page_number
      : null;
  const endPageNumber =
    typeof citation.end_page_number === "number" ? citation.end_page_number : null;
  const documentIndex =
    typeof citation.document_index === "number" ? citation.document_index : null;
  const citedText =
    typeof citation.cited_text === "string" ? citation.cited_text : null;

  if (
    startPageNumber === null ||
    endPageNumber === null ||
    documentIndex === null ||
    citedText === null
  ) {
    return null;
  }

  return {
    provider: "anthropic" as const,
    type: "page_location" as const,
    providerFileId:
      typeof citation.file_id === "string" ? citation.file_id : null,
    citedText,
    documentIndex,
    documentTitle:
      typeof citation.document_title === "string" ? citation.document_title : null,
    startPageNumber,
    endPageNumber,
    raw: citation,
  };
}
