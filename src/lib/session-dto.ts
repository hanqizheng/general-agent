import type {
  AttachmentKind,
  AttachmentMimeType,
  AttachmentSourceKind,
  AttachmentStatus,
} from "./attachment-types";
import type {
  MessagePartEndState,
  MessagePartKind,
  MessageStatus,
  SessionStatus,
  UIMessageRole,
} from "./chat-types";

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
  kind: MessagePartKind;
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
  status: MessageStatus;
  createdAt: string;
  completedAt: string | null;
  parts: TranscriptPartDto[];
}

export interface SessionMessagesPageDto {
  messages: TranscriptMessageDto[];
  hasMore: boolean;
  nextBeforeSequence: number | null;
}

export interface AttachmentDto {
  id: string;
  kind: AttachmentKind;
  mimeType: AttachmentMimeType;
  originalName: string | null;
  sizeBytes: number | null;
  status: AttachmentStatus;
  sourceKind: AttachmentSourceKind;
  createdAt: string;
}

export interface CreateAttachmentResponseDto {
  attachment: AttachmentDto;
}

export interface DeleteAttachmentResponseDto {
  ok: true;
}

export interface SendMessageInput {
  text: string;
  attachments: Array<{
    attachmentId: string;
  }>;
}

export interface StartRunResponseDto {
  session: SessionDetailDto;
  run: {
    id: string;
    status: string;
  };
  userMessage: TranscriptMessageDto;
}
