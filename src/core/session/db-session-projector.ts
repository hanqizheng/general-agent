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
import {
  MESSAGE_PART_END_STATE,
  MESSAGE_PART_KIND,
  MESSAGE_ROLE,
  MESSAGE_STATUS,
  SESSION_EVENT_TYPE,
} from "@/lib/constants";
import { TOOL_END_STATE, TURN_END_REASON } from "@/core/events/constants";

interface CurrentTurnState {
  turnIndex: number;
  assistantMessageId: string | null;
  internalMessageId: string | null;
  hasAssistantError: boolean;
  hasAssistantInterrupted: boolean;
  internalMessageHasTerminalStatus: boolean;
}

export class DbSessionProjector {
  private currentTurn: CurrentTurnState = {
    turnIndex: 0,
    assistantMessageId: null,
    internalMessageId: null,
    hasAssistantError: false,
    hasAssistantInterrupted: false,
    internalMessageHasTerminalStatus: false,
  };

  constructor(
    private readonly sessionId: string,
    private readonly runId: string,
  ) {}

  async project(event: AgentEvent) {
    switch (event.type) {
      case SESSION_EVENT_TYPE.STATUS:
        await touchSession(db, this.sessionId, new Date(event.timestamp));
        break;

      case "turn.start":
        this.currentTurn = {
          turnIndex: this.currentTurn.turnIndex + 1,
          assistantMessageId: null,
          internalMessageId: null,
          hasAssistantError: false,
          hasAssistantInterrupted: false,
          internalMessageHasTerminalStatus: false,
        };
        break;

      case "message.start":
        if (event.role === MESSAGE_ROLE.ASSISTANT) {
          this.currentTurn.assistantMessageId = event.messageId;
          await createAssistantMessage(db, {
            id: event.messageId,
            sessionId: this.sessionId,
            runId: this.runId,
            turnIndex: this.currentTurn.turnIndex,
          });
        }
        break;

      case "message.part.start":
        if (event.kind === MESSAGE_PART_KIND.TOOL) {
          break;
        }
        await createMessagePart(db, {
          messageId: event.messageId,
          partIndex: event.partIndex,
          kind: event.kind,
        });
        break;

      case "message.artifact":
        await updateMessagePart(db, {
          messageId: event.messageId,
          partIndex: event.partIndex,
          payload: event.artifact,
          textContent: event.artifact.summaryText ?? null,
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
          state:
            event.state === MESSAGE_PART_END_STATE.COMPLETE
              ? MESSAGE_STATUS.COMPLETED
              : event.state === MESSAGE_PART_END_STATE.INTERRUPTED
                ? MESSAGE_STATUS.INTERRUPTED
                : MESSAGE_STATUS.ERROR,
        });
        if (event.state === MESSAGE_PART_END_STATE.INTERRUPTED) {
          this.currentTurn.hasAssistantInterrupted = true;
          await markMessageStatus(db, event.messageId, MESSAGE_STATUS.INTERRUPTED);
        } else if (
          event.kind !== MESSAGE_PART_KIND.TOOL &&
          event.state === MESSAGE_PART_END_STATE.ERROR
        ) {
          this.currentTurn.hasAssistantError = true;
          await markMessageStatus(db, event.messageId, MESSAGE_STATUS.ERROR);
        }
        break;

      case "message.end":
        await markMessageStatus(
          db,
          event.messageId,
          this.currentTurn.hasAssistantError
            ? MESSAGE_STATUS.ERROR
            : this.currentTurn.hasAssistantInterrupted
              ? MESSAGE_STATUS.INTERRUPTED
              : MESSAGE_STATUS.COMPLETED,
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
            isError: event.state === TOOL_END_STATE.ERROR,
            durationMs: event.durationMs,
            error: event.error ?? null,
            interrupted: event.state === TOOL_END_STATE.INTERRUPTED,
          },
        });
        await updateMessagePart(db, {
          messageId: internal.id,
          partIndex: event.partIndex,
          state:
            event.state === TOOL_END_STATE.ERROR
              ? MESSAGE_STATUS.ERROR
              : event.state === TOOL_END_STATE.INTERRUPTED
                ? MESSAGE_STATUS.INTERRUPTED
                : MESSAGE_STATUS.COMPLETED,
          textContent: event.output,
          payload: {
            toolCallId: event.toolCallId,
            isError: event.state === TOOL_END_STATE.ERROR,
            durationMs: event.durationMs,
            error: event.error ?? null,
            interrupted: event.state === TOOL_END_STATE.INTERRUPTED,
          },
        });
        break;
      }

      case "turn.end":
        if (
          event.reason === TURN_END_REASON.INTERRUPTED &&
          this.currentTurn.assistantMessageId
        ) {
          await markMessageStatus(
            db,
            this.currentTurn.assistantMessageId,
            MESSAGE_STATUS.INTERRUPTED,
          );
        }

        if (
          this.currentTurn.internalMessageId &&
          !this.currentTurn.internalMessageHasTerminalStatus
        ) {
          await markMessageStatus(
            db,
            this.currentTurn.internalMessageId,
            event.reason === TURN_END_REASON.ERROR
              ? MESSAGE_STATUS.ERROR
              : event.reason === TURN_END_REASON.INTERRUPTED
                ? MESSAGE_STATUS.INTERRUPTED
                : MESSAGE_STATUS.COMPLETED,
          );
          this.currentTurn.internalMessageHasTerminalStatus = true;
        }
        break;

      case SESSION_EVENT_TYPE.ERROR:
        if (
          this.currentTurn.internalMessageId &&
          !this.currentTurn.internalMessageHasTerminalStatus
        ) {
          await markMessageStatus(
            db,
            this.currentTurn.internalMessageId,
            MESSAGE_STATUS.ERROR,
          );
          this.currentTurn.internalMessageHasTerminalStatus = true;
        }
        break;

      default:
        break;
    }
  }
}
