import type { MessagePartEndState, SessionStatus, UIMessageRole } from "./chat-types";

export interface SessionSummaryDto {
  id: string;
  title: string;
  status: SessionStatus;
  createdAt: string;
  lastMessageAt: string | null;
}

export interface SessionDetailDto extends SessionSummaryDto {
  activeRunId: string | null;
  workspaceRoot: string;
}

export interface TranscriptPartDto {
  partIndex: number;
  kind: "text" | "reasoning" | "tool";
  state: MessagePartEndState | null;
  textContent: string | null;
  payload: Record<string, unknown>;
}

export interface TranscriptMessageDto {
  id: string;
  sequence: number;
  turnIndex: number | null;
  role: UIMessageRole;
  visibility: "visible" | "internal";
  status: "streaming" | "completed" | "error" | "interrupted";
  createdAt: string;
  completedAt: string | null;
  parts: TranscriptPartDto[];
}

export interface SessionMessagesPageDto {
  messages: TranscriptMessageDto[];
  hasMore: boolean;
  nextBeforeSequence: number | null;
}

export interface StartRunResponseDto {
  session: SessionDetailDto;
  run: {
    id: string;
    status: string;
  };
  userMessage: TranscriptMessageDto;
}
