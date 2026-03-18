import { db } from "@/db";
import {
  createAssistantMessage,
  createMessagePart,
  ensureInternalToolResultMessage,
  markMessageStatus,
  updateMessagePart,
  appendMessagePartText,
} from "@/db/repositories/message-repository";
import { touchSession } from "@/db/repositories/session-repository";
import type { AgentEvent } from "@/core/events/types";

interface CurrentTurnState {
  turnIndex: number;
  internalMessageId: string | null;
  hasAssistantError: boolean;
  internalMessageHasTerminalStatus: boolean;
}

export class DbSessionProjector {
  private currentTurn: CurrentTurnState = {
    turnIndex: 0,
    internalMessageId: null,
    hasAssistantError: false,
    internalMessageHasTerminalStatus: false,
  };

  constructor(
    private readonly sessionId: string,
    private readonly runId: string,
  ) {}

  async project(event: AgentEvent) {
    switch (event.type) {
      case "session.status":
        await touchSession(db, this.sessionId, new Date(event.timestamp));
        break;

      case "turn.start":
        this.currentTurn = {
          turnIndex: this.currentTurn.turnIndex + 1,
          internalMessageId: null,
          hasAssistantError: false,
          internalMessageHasTerminalStatus: false,
        };
        break;

      case "message.start":
        if (event.role === "assistant") {
          await createAssistantMessage(db, {
            id: event.messageId,
            sessionId: this.sessionId,
            runId: this.runId,
            turnIndex: this.currentTurn.turnIndex,
          });
        }
        break;

      case "message.part.start":
        if (event.kind === "tool") {
          break;
        }
        await createMessagePart(db, {
          messageId: event.messageId,
          partIndex: event.partIndex,
          kind: event.kind,
        });
        break;

      case "message.text.delta":
        await appendMessagePartText(db, {
          messageId: event.messageId,
          partIndex: event.partIndex,
          delta: event.text,
        });
        break;

      case "message.reasoning.delta":
        await appendMessagePartText(db, {
          messageId: event.messageId,
          partIndex: event.partIndex,
          delta: event.content,
        });
        break;

      case "message.part.end":
        await updateMessagePart(db, {
          messageId: event.messageId,
          partIndex: event.partIndex,
          state: event.state === "complete" ? "completed" : "error",
        });
        if (event.kind !== "tool" && event.state === "error") {
          this.currentTurn.hasAssistantError = true;
          await markMessageStatus(db, event.messageId, "error");
        }
        break;

      case "message.end":
        await markMessageStatus(
          db,
          event.messageId,
          this.currentTurn.hasAssistantError ? "error" : "completed",
        );
        break;

      case "message.tool.start": {
        const internal = await ensureInternalToolResultMessage(db, {
          sessionId: this.sessionId,
          runId: this.runId,
          turnIndex: this.currentTurn.turnIndex,
        });
        this.currentTurn.internalMessageId = internal.id;
        await createMessagePart(db, {
          messageId: event.messageId,
          partIndex: event.partIndex,
          kind: "tool_use",
          payload: {
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            input: event.input,
          },
        });
        break;
      }

      case "message.tool.end": {
        const internal = await ensureInternalToolResultMessage(db, {
          sessionId: this.sessionId,
          runId: this.runId,
          turnIndex: this.currentTurn.turnIndex,
        });
        this.currentTurn.internalMessageId = internal.id;

        await createMessagePart(db, {
          messageId: internal.id,
          partIndex: event.partIndex,
          kind: "tool_result",
          payload: {
            toolCallId: event.toolCallId,
            isError: event.state === "error",
            durationMs: event.durationMs,
            error: event.error ?? null,
          },
        });
        await updateMessagePart(db, {
          messageId: internal.id,
          partIndex: event.partIndex,
          state: "completed",
          textContent: event.output,
          payload: {
            toolCallId: event.toolCallId,
            isError: event.state === "error",
            durationMs: event.durationMs,
            error: event.error ?? null,
          },
        });
        break;
      }

      case "turn.end":
        if (
          this.currentTurn.internalMessageId &&
          !this.currentTurn.internalMessageHasTerminalStatus
        ) {
          await markMessageStatus(
            db,
            this.currentTurn.internalMessageId,
            event.reason === "error" ? "error" : "completed",
          );
          this.currentTurn.internalMessageHasTerminalStatus = true;
        }
        break;

      case "session.error":
        if (
          this.currentTurn.internalMessageId &&
          !this.currentTurn.internalMessageHasTerminalStatus
        ) {
          await markMessageStatus(db, this.currentTurn.internalMessageId, "error");
          this.currentTurn.internalMessageHasTerminalStatus = true;
        }
        break;

      default:
        break;
    }
  }
}
