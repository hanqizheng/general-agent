import { MESSAGE_PART_KIND, MESSAGE_ROLE } from "@/lib/constants";
import { InterruptedError, isAbortError } from "@/lib/errors";
import { genMessageId } from "@/lib/id";

import { MESSAGE_PART_END_STATE, TOOL_END_STATE } from "../events/constants";
import {
  artifactPayloadToContentBlock,
  buildArtifactPayload,
  buildStructuredOutputSummary,
} from "./artifacts";
import type {
  MessagePartEndState,
  MessagePartKind,
} from "../events/types";
import type { LLMContentBlock } from "../provider/base";
import type { PendingToolCall, TurnParams, TurnResult } from "./types";
import {
  structuredOutputParams,
  structuredOutputToolName,
} from "../tools/built-in/structured-output";
import type { ArtifactPartPayload } from "@/lib/artifact-types";

type StreamPartKind =
  | typeof MESSAGE_PART_KIND.TEXT
  | typeof MESSAGE_PART_KIND.REASONING;

export async function executeTurn(params: TurnParams): Promise<TurnResult> {
  const {
    emitter,
    provider,
    streamParams,
    toolRegistry,
    toolContext,
    contractRegistry,
  } = params;
  const msgId = genMessageId();
  const interruptSignal = streamParams.signal;

  emitter.emit({ type: "message.start", messageId: msgId, role: "assistant" });

  const contentBlocks: LLMContentBlock[] = [];
  const pendingToolCalls: PendingToolCall[] = [];
  const completedTextPartIndices: number[] = [];

  let currentPartKind: StreamPartKind | null = null;
  let currentPartContent = "";
  let partIndex = 0;

  // 主动通知 UI 一个新的 part 开始了，这样 UI 可以更快地渲染出对应的组件（比如工具调用的组件），而不需要等到第一个 delta 到达时才知道这个 part 的存在
  const emitPartStart = (
    kind: MessagePartKind,
    customPartIndex = partIndex,
  ) => {
    emitter.emit({
      type: "message.part.start",
      messageId: msgId,
      partIndex: customPartIndex,
      kind,
    });
  };

  const emitPartEnd = (
    kind: MessagePartKind,
    state: MessagePartEndState,
    customPartIndex = partIndex,
  ) => {
    emitter.emit({
      type: "message.part.end",
      messageId: msgId,
      partIndex: customPartIndex,
      kind,
      state,
    });
  };

  /**
   * 仅限 Text 和 Reasoning 的 part 完成 flush
   * 通知对应的事件 done 并且把对应囤积的 currentPartContent 加入 contentBlocks 中
   * 因为完成一次具体的 part 所以 partIndex 也会增加
   */
  const flushCurrentPart = (
    state: MessagePartEndState = MESSAGE_PART_END_STATE.COMPLETE,
  ) => {
    if (!currentPartKind) {
      return;
    }

    if (currentPartContent.length > 0) {
      if (currentPartKind === MESSAGE_PART_KIND.TEXT) {
        if (state === MESSAGE_PART_END_STATE.COMPLETE) {
          emitter.emit({
            type: "message.text.done",
            messageId: msgId,
            partIndex,
          });
        }

        completedTextPartIndices.push(partIndex);

        contentBlocks.push({
          type: "text",
          text: currentPartContent,
        });
      } else {
        if (state === MESSAGE_PART_END_STATE.COMPLETE) {
          emitter.emit({
            type: "message.reasoning.done",
            messageId: msgId,
            partIndex,
            text: currentPartContent,
          });
        }

        contentBlocks.push({
          type: "reasoning",
          text: currentPartContent,
        });
      }
    }

    emitPartEnd(currentPartKind, state);

    currentPartKind = null;
    currentPartContent = "";
    partIndex += 1;
  };

  /**
   * 
   * - 如果当前没有 part，就创建
   * - 如果当前 part 类型不同，就先 flush，再创建新 part
   * - 如果当前 part 类型相同，就继续沿用
   */
  const ensureStreamPart = (kind: StreamPartKind) => {
    if (currentPartKind !== null && currentPartKind !== kind) {
      flushCurrentPart();
    }

    if (currentPartKind === null) {
      emitPartStart(kind);
      currentPartKind = kind;
    }
  };

  // chunk 拼接器
  const appendToStreamPart = (kind: StreamPartKind, value: string) => {
    if (!value) {
      return;
    }

    ensureStreamPart(kind);
    currentPartContent += value;

    if (kind === MESSAGE_PART_KIND.TEXT) {
      emitter.emit({
        type: "message.text.delta",
        messageId: msgId,
        partIndex,
        text: value,
      });
    } else {
      emitter.emit({
        type: "message.reasoning.delta",
        messageId: msgId,
        partIndex,
        content: value,
      });
    }
  };

  const ensureNotInterrupted = () => {
    if (interruptSignal?.aborted) {
      throw new InterruptedError();
    }
  };

  const interruptToolPart = (
    toolCall: PendingToolCall,
    durationMs = 0,
    emitToolEnd = false,
  ) => {
    if (emitToolEnd) {
      emitter.emit({
        type: "message.tool.end",
        messageId: msgId,
        partIndex: toolCall.partIndex,
        toolCallId: toolCall.id,
        output: "Interrupted by user.",
        error: undefined,
        durationMs,
        state: TOOL_END_STATE.INTERRUPTED,
      });
    }

    emitter.emit({
      type: "message.part.end",
      messageId: msgId,
      partIndex: toolCall.partIndex,
      kind: MESSAGE_PART_KIND.TOOL,
      state: MESSAGE_PART_END_STATE.INTERRUPTED,
    });
  };

  const emitArtifactPart = (
    artifact: ArtifactPartPayload,
    artifactPartIndex: number,
  ) => {
    emitPartStart(MESSAGE_PART_KIND.ARTIFACT, artifactPartIndex);
    emitter.emit({
      type: "message.artifact",
      messageId: msgId,
      partIndex: artifactPartIndex,
      artifact,
    });
    emitPartEnd(
      MESSAGE_PART_KIND.ARTIFACT,
      MESSAGE_PART_END_STATE.COMPLETE,
      artifactPartIndex,
    );
    contentBlocks.push(artifactPayloadToContentBlock(artifact));
  };

  try {
    try {
      const stream = await provider.stream(streamParams);
      ensureNotInterrupted();

      for await (const chunk of stream) {
        ensureNotInterrupted();

        switch (chunk.type) {
          case "text_delta":
            appendToStreamPart(MESSAGE_PART_KIND.TEXT, chunk.text);
            break;

          case "reasoning_delta":
            appendToStreamPart(MESSAGE_PART_KIND.REASONING, chunk.text);
            break;

          case "tool_use":
            flushCurrentPart();

            emitPartStart(MESSAGE_PART_KIND.TOOL);

            contentBlocks.push({
              type: "tool_use",
              id: chunk.id,
              name: chunk.name,
              input: chunk.input,
            });

            pendingToolCalls.push({
              id: chunk.id,
              name: chunk.name,
              input: chunk.input,
              partIndex,
            });

            partIndex += 1;
            break;

          case "usage":
            break;

          case "text_annotations":
            for (const block of chunk.blocks) {
              const targetPartIndex = completedTextPartIndices[block.blockIndex];
              if (
                typeof targetPartIndex === "number" &&
                block.annotations.length > 0
              ) {
                emitter.emit({
                  type: "message.text.annotations",
                  messageId: msgId,
                  partIndex: targetPartIndex,
                  annotations: block.annotations,
                });
              }
            }
            break;
        }
      }
    } catch (error) {
      if (interruptSignal?.aborted || isAbortError(error)) {
        flushCurrentPart(MESSAGE_PART_END_STATE.INTERRUPTED);

        for (const toolCall of pendingToolCalls) {
          interruptToolPart(toolCall);
        }

        throw new InterruptedError();
      }

      flushCurrentPart(MESSAGE_PART_END_STATE.ERROR);

      for (const toolCall of pendingToolCalls) {
        emitter.emit({
          type: "message.part.end",
          messageId: msgId,
          partIndex: toolCall.partIndex,
          kind: MESSAGE_PART_KIND.TOOL,
          state: MESSAGE_PART_END_STATE.ERROR,
        });
      }

      throw error;
    }

    ensureNotInterrupted();
    flushCurrentPart();

    const toolResultBlocks: LLMContentBlock[] = [];
    let nextArtifactPartIndex = partIndex;

    for (const [index, toolCall] of pendingToolCalls.entries()) {
      if (interruptSignal?.aborted) {
        for (const remainingToolCall of pendingToolCalls.slice(index)) {
          interruptToolPart(remainingToolCall);
        }
        throw new InterruptedError();
      }

      emitter.emit({
        type: "message.tool.start",
        messageId: msgId,
        partIndex: toolCall.partIndex,
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        input: toolCall.input,
      });

      emitter.emit({
        type: "message.tool.running",
        messageId: msgId,
        partIndex: toolCall.partIndex,
        toolCallId: toolCall.id,
      });

      const startTime = Date.now();
      let output = "";
      let isError = false;
      const producedArtifacts: ArtifactPartPayload[] = [];

      ensureNotInterrupted();

      if (!toolRegistry || !toolContext) {
        output = "Tool system is not configured.";
        isError = true;
      } else {
        try {
          ensureNotInterrupted();
          if (toolCall.name === structuredOutputToolName) {
            if (!contractRegistry) {
              throw new Error("Artifact contract registry is not configured.");
            }

            const parsed = structuredOutputParams.parse(toolCall.input);
            const contract = contractRegistry.get(parsed.contract_id);
            const currentAssistantContext = contentBlocks.filter(
              (block) =>
                block.type !== "tool_use" || block.id !== toolCall.id,
            );
            const structuredMessages =
              currentAssistantContext.length > 0
                ? [
                    ...streamParams.messages,
                    {
                      role: MESSAGE_ROLE.ASSISTANT,
                      content: currentAssistantContext,
                    } as const,
                  ]
                : streamParams.messages;

            const result = await provider.generateStructured({
              messages: structuredMessages,
              systemPrompt: streamParams.systemPrompt,
              contract,
              instruction: parsed.instruction,
              signal: interruptSignal,
            });

            ensureNotInterrupted();

            const artifact = buildArtifactPayload(contract, result, {
              kind: "assistant",
              name: structuredOutputToolName,
            });

            producedArtifacts.push(artifact);
            output = buildStructuredOutputSummary(artifact);
            isError = false;
          } else {
            const tool = toolRegistry.get(toolCall.name);
            const parsed = tool.parameters.parse(toolCall.input);
            const result = await tool.execute(parsed, toolContext);
            ensureNotInterrupted();
            output = result.output;
            isError = result.isError;

            for (const artifact of result.artifacts ?? []) {
              if (artifact.contractId) {
                if (!contractRegistry) {
                  throw new Error(
                    `Artifact contract registry is not configured for "${artifact.contractId}".`,
                  );
                }

                const contract = contractRegistry.get(artifact.contractId);
                producedArtifacts.push(
                  buildArtifactPayload(
                    contract,
                    {
                      data: artifact.data,
                      summaryText: artifact.summaryText ?? null,
                    },
                    {
                      kind: "tool",
                      name: toolCall.name,
                    },
                  ),
                );
                continue;
              }

              producedArtifacts.push({
                artifactType: artifact.artifactType,
                contractId: artifact.contractId ?? null,
                producer: {
                  kind: "tool",
                  name: toolCall.name,
                },
                data: artifact.data,
                summaryText: artifact.summaryText ?? null,
              });
            }
          }
        } catch (error: unknown) {
          if (interruptSignal?.aborted || isAbortError(error)) {
            interruptToolPart(toolCall, Date.now() - startTime, true);

            for (const remainingToolCall of pendingToolCalls.slice(index + 1)) {
              interruptToolPart(remainingToolCall);
            }

            throw new InterruptedError();
          }

          const message =
            error instanceof Error
              ? error.message
              : "Unknown tool execution error";

          output = `Error executing tool "${toolCall.name}": ${message}`;
          isError = true;
        }
      }

      emitter.emit({
        type: "message.tool.end",
        messageId: msgId,
        partIndex: toolCall.partIndex,
        toolCallId: toolCall.id,
        output,
        error: isError ? output : undefined,
        durationMs: Date.now() - startTime,
        state: isError ? TOOL_END_STATE.ERROR : TOOL_END_STATE.COMPLETE,
      });

      emitter.emit({
        type: "message.part.end",
        messageId: msgId,
        partIndex: toolCall.partIndex,
        kind: MESSAGE_PART_KIND.TOOL,
        state: isError
          ? MESSAGE_PART_END_STATE.ERROR
          : MESSAGE_PART_END_STATE.COMPLETE,
      });

      for (const artifact of producedArtifacts) {
        emitArtifactPart(artifact, nextArtifactPartIndex);
        nextArtifactPartIndex += 1;
      }

      toolResultBlocks.push({
        type: "tool_result",
        toolCallId: toolCall.id,
        content: output,
        isError,
      });
    }

    return {
      assistantMessage: {
        role: MESSAGE_ROLE.ASSISTANT,
        content: contentBlocks,
      },
      hasToolCalls: pendingToolCalls.length > 0,
      toolResultMessage:
        pendingToolCalls.length > 0
          ? {
              role: MESSAGE_ROLE.USER,
              content: toolResultBlocks,
            }
          : undefined,
    };
  } finally {
    emitter.emit({ type: "message.end", messageId: msgId });
  }
}
