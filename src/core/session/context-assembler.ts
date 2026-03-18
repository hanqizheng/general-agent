import type { LLMContentBlock, LLMMessage } from "@/core/provider/base";
import { getCompletedTranscript } from "@/db/repositories/message-repository";

interface TranscriptMessage {
  id: string;
  runId: string | null;
  turnIndex: number | null;
  role: "user" | "assistant";
  visibility: "visible" | "internal";
}

interface TranscriptPart {
  messageId: string;
  partIndex: number;
  kind: "text" | "reasoning" | "tool_use" | "tool_result";
  textContent: string | null;
  payload: Record<string, unknown>;
}

function sortParts(parts: TranscriptPart[]) {
  return [...parts].sort((a, b) => a.partIndex - b.partIndex);
}

function buildVisibleContent(parts: TranscriptPart[]): LLMContentBlock[] {
  const content: LLMContentBlock[] = [];

  for (const part of sortParts(parts)) {
    switch (part.kind) {
      case "text":
        content.push({
          type: "text",
          text: part.textContent ?? "",
        });
        break;

      case "reasoning":
        content.push({
          type: "reasoning",
          text: part.textContent ?? "",
        });
        break;

      case "tool_use":
        {
          const payload = part.payload as {
            toolCallId: string;
            toolName: string;
            input: Record<string, unknown>;
          };

          content.push({
            type: "tool_use",
            id: String(payload.toolCallId),
            name: String(payload.toolName),
            input:
              typeof payload.input === "object" && payload.input
                ? payload.input
                : {},
          });
        }
        break;

      default:
        break;
    }
  }

  return content;
}

function buildToolResultBlocks(parts: TranscriptPart[]): LLMContentBlock[] {
  return sortParts(parts)
    .filter((part) => part.kind === "tool_result")
    .map<LLMContentBlock>((part) => {
      const payload = part.payload as {
        toolCallId: string;
        isError: boolean;
      };

      return {
        type: "tool_result",
        toolCallId: String(payload.toolCallId),
        content: part.textContent ?? "",
        isError: Boolean(payload.isError),
      };
    });
}

export async function assembleSessionContext(
  sessionId: string,
): Promise<LLMMessage[]> {
  const transcript = await getCompletedTranscript(sessionId);
  const partsByMessageId = new Map<string, TranscriptPart[]>();
  const toolResultsByTurn = new Map<string, LLMContentBlock[]>();

  for (const part of transcript.parts) {
    const current = partsByMessageId.get(part.messageId) ?? [];
    current.push(part);
    partsByMessageId.set(part.messageId, current);
  }

  for (const message of transcript.messages) {
    if (
      message.visibility !== "internal" ||
      message.runId === null ||
      message.turnIndex === null
    ) {
      continue;
    }

    const toolResults = buildToolResultBlocks(partsByMessageId.get(message.id) ?? []);
    toolResultsByTurn.set(`${message.runId}:${message.turnIndex}`, toolResults);
  }

  const result: LLMMessage[] = [];

  for (const message of transcript.messages as TranscriptMessage[]) {
    if (message.visibility !== "visible") {
      continue;
    }

    const parts = partsByMessageId.get(message.id) ?? [];
    const content = buildVisibleContent(parts);

    if (message.role === "user") {
      result.push({
        role: "user",
        content: content.filter((block) => block.type === "text"),
      });
      continue;
    }

    const assistantContent = content.filter(
      (block) => block.type !== "reasoning",
    );
    const toolCallIds = assistantContent
      .filter((block): block is Extract<LLMContentBlock, { type: "tool_use" }> =>
        block.type === "tool_use",
      )
      .map((block) => block.id);

    if (toolCallIds.length === 0) {
      result.push({
        role: "assistant",
        content: assistantContent,
      });
      continue;
    }

    const turnKey =
      message.runId === null || message.turnIndex === null
        ? null
        : `${message.runId}:${message.turnIndex}`;
    const toolResults = turnKey ? toolResultsByTurn.get(turnKey) ?? [] : [];
    const hasAllToolResults = toolCallIds.every((toolCallId) =>
      toolResults.some(
        (block) =>
          block.type === "tool_result" && block.toolCallId === toolCallId,
      ),
    );

    if (!hasAllToolResults) {
      continue;
    }

    result.push({
      role: "assistant",
      content: assistantContent,
    });
    result.push({
      role: "user",
      content: toolResults,
    });
  }

  return result;
}
