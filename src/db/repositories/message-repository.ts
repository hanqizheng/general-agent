import {
  and,
  asc,
  desc,
  eq,
  inArray,
  lt,
  sql,
} from "drizzle-orm";

import { db } from "@/db";
import { messageParts, messages } from "@/db/schema";
import type {
  MessagePartPayload,
  MessagePartKindValue,
  MessagePartStateValue,
  MessageRoleValue,
  MessageStatusValue,
  MessageVisibilityValue,
} from "@/db/schema";
import { projectPublicPromptCommandInvocations } from "@/core/skills";
import {
  allocateNextSequence,
  maybePromoteSessionTitle,
  touchSession,
} from "./session-repository";
import { genMessageId, genPartId } from "@/lib/id";
import {
  MESSAGE_PART_END_STATE,
  MESSAGE_PART_KIND,
  MESSAGE_STATUS,
} from "@/lib/constants";
import type { AttachmentPartPayload } from "@/lib/attachment-types";
import type {
  SessionMessagesPageDto,
  TranscriptMessageDto,
  TranscriptPartDto,
} from "@/lib/session-dto";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbExecutor = typeof db | DbTransaction;

interface InsertTextMessageInput {
  sessionId: string;
  runId: string | null;
  turnIndex: number | null;
  role: MessageRoleValue;
  visibility: MessageVisibilityValue;
  status: MessageStatusValue;
  text: string;
  metadata?: Record<string, unknown>;
}

function mapPartKind(kind: typeof messageParts.$inferSelect.kind): TranscriptPartDto["kind"] {
  if (kind === "tool_use" || kind === "tool_result") {
    return "tool";
  }

  return kind;
}

function mapPartState(
  state: typeof messageParts.$inferSelect.state,
): TranscriptPartDto["state"] {
  if (state === MESSAGE_STATUS.STREAMING) {
    return null;
  }

  if (state === MESSAGE_STATUS.COMPLETED) {
    return "complete";
  }

  if (state === MESSAGE_STATUS.INTERRUPTED) {
    return MESSAGE_PART_END_STATE.INTERRUPTED;
  }

  return MESSAGE_PART_END_STATE.ERROR;
}

function toTranscriptMessages(
  rows: (typeof messages.$inferSelect)[],
  partRows: (typeof messageParts.$inferSelect)[],
) {
  const partsByMessageId = new Map<string, TranscriptPartDto[]>();

  for (const part of partRows) {
    const current = partsByMessageId.get(part.messageId) ?? [];
    current.push({
      partIndex: part.partIndex,
      kind: mapPartKind(part.kind),
      state: mapPartState(part.state),
      textContent: part.textContent,
      payload: part.payload as unknown as Record<string, unknown>,
    });
    partsByMessageId.set(part.messageId, current);
  }

  return rows.map<TranscriptMessageDto>((row) => ({
    id: row.id,
    sequence: row.sequence,
    turnIndex: row.turnIndex,
    role: row.role,
    visibility: row.visibility,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    parts: (partsByMessageId.get(row.id) ?? []).sort(
      (a, b) => a.partIndex - b.partIndex,
    ),
    metadata: {
      invokedCommands: projectPublicPromptCommandInvocations(row.metadata),
    },
  }));
}

export async function insertVisibleUserMessage(
  executor: DbExecutor,
  input: Omit<InsertTextMessageInput, "role" | "visibility" | "status"> & {
    text: string;
    attachments?: AttachmentPartPayload[];
  },
) {
  const sequence = await allocateNextSequence(executor, input.sessionId);
  const messageId = genMessageId();
  const now = new Date();

  const [message] = await executor
    .insert(messages)
    .values({
      id: messageId,
      sessionId: input.sessionId,
      runId: input.runId,
      sequence,
      turnIndex: input.turnIndex,
      role: "user",
      visibility: "visible",
      status: MESSAGE_STATUS.COMPLETED,
      metadata: input.metadata ?? {},
      createdAt: now,
      completedAt: now,
    })
    .returning();

  const attachmentParts = (input.attachments ?? []).map((attachment, index) => ({
    id: genPartId(),
    messageId,
    partIndex: index,
    kind: "attachment" as const,
    state: "completed" as const,
    textContent: null,
    payload: attachment,
    createdAt: now,
    updatedAt: now,
  }));

  const partValues: (typeof messageParts.$inferInsert)[] = [
    ...attachmentParts,
    {
      id: genPartId(),
      messageId,
      partIndex: attachmentParts.length,
      kind: "text",
      state: "completed",
      textContent: input.text,
      payload: {},
      createdAt: now,
      updatedAt: now,
    },
  ];

  await executor.insert(messageParts).values(partValues);

  await touchSession(executor, input.sessionId, now);
  await maybePromoteSessionTitle(executor, input.sessionId, sequence, input.text);

  return message;
}

export async function attachmentHasMessageReference(
  sessionId: string,
  attachmentId: string,
) {
  const [row] = await db
    .select({
      messageId: messageParts.messageId,
    })
    .from(messageParts)
    .innerJoin(messages, eq(messageParts.messageId, messages.id))
    .where(
      and(
        eq(messages.sessionId, sessionId),
        eq(messageParts.kind, MESSAGE_PART_KIND.ATTACHMENT),
        sql`${messageParts.payload} ->> 'attachmentId' = ${attachmentId}`,
      ),
    )
    .limit(1);

  return Boolean(row);
}

export async function createAssistantMessage(
  executor: DbExecutor,
  input: {
    id: string;
    sessionId: string;
    runId: string;
    turnIndex: number;
  },
) {
  const sequence = await allocateNextSequence(executor, input.sessionId);
  const now = new Date();

  const [message] = await executor
    .insert(messages)
    .values({
      id: input.id,
      sessionId: input.sessionId,
      runId: input.runId,
      sequence,
      turnIndex: input.turnIndex,
      role: "assistant",
      visibility: "visible",
      status: MESSAGE_STATUS.STREAMING,
      createdAt: now,
    })
    .returning();

  await touchSession(executor, input.sessionId, now);
  return message;
}

export async function ensureInternalToolResultMessage(
  executor: DbExecutor,
  input: {
    sessionId: string;
    runId: string;
    turnIndex: number;
  },
) {
  const [existing] = await executor
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.sessionId, input.sessionId),
        eq(messages.runId, input.runId),
        eq(messages.turnIndex, input.turnIndex),
        eq(messages.role, "user"),
        eq(messages.visibility, "internal"),
      ),
    )
    .limit(1);

  if (existing) {
    return existing;
  }

  const sequence = await allocateNextSequence(executor, input.sessionId);
  const now = new Date();
  const [created] = await executor
    .insert(messages)
    .values({
      id: genMessageId(),
      sessionId: input.sessionId,
      runId: input.runId,
      sequence,
      turnIndex: input.turnIndex,
      role: "user",
      visibility: "internal",
      status: MESSAGE_STATUS.STREAMING,
      createdAt: now,
    })
    .returning();

  await touchSession(executor, input.sessionId, now);
  return created;
}

export async function createMessagePart(
  executor: DbExecutor,
  input: {
    messageId: string;
    partIndex: number;
    kind:
      | "text"
      | "attachment"
      | "reasoning"
      | "tool_use"
      | "tool_result"
      | "artifact";
    payload?: MessagePartPayload;
  },
) {
  const now = new Date();
  const [row] = await executor
    .insert(messageParts)
    .values({
      id: genPartId(),
      messageId: input.messageId,
      partIndex: input.partIndex,
      kind: input.kind,
      state: "streaming",
      textContent: null,
      payload: input.payload ?? {},
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [messageParts.messageId, messageParts.partIndex],
    })
    .returning();

  return row ?? null;
}

export async function appendMessagePartText(
  executor: DbExecutor,
  input: {
    messageId: string;
    partIndex: number;
    delta: string;
  },
) {
  await executor
    .update(messageParts)
    .set({
      textContent: sql`coalesce(${messageParts.textContent}, '') || ${input.delta}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(messageParts.messageId, input.messageId),
        eq(messageParts.partIndex, input.partIndex),
      ),
    );
}

export async function updateMessagePart(
  executor: DbExecutor,
  input: {
    messageId: string;
    partIndex: number;
    state?: MessagePartStateValue;
    textContent?: string | null;
    payload?: MessagePartPayload;
  },
) {
  await executor
    .update(messageParts)
    .set({
      ...(input.state ? { state: input.state } : {}),
      ...(input.textContent !== undefined
        ? { textContent: input.textContent }
        : {}),
      ...(input.payload !== undefined ? { payload: input.payload } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(messageParts.messageId, input.messageId),
        eq(messageParts.partIndex, input.partIndex),
      ),
    );
}

export async function markMessageStatus(
  executor: DbExecutor,
  messageId: string,
  status: MessageStatusValue,
) {
  await executor
    .update(messages)
    .set({
      status,
      completedAt: status === MESSAGE_STATUS.STREAMING ? null : new Date(),
    })
    .where(eq(messages.id, messageId));
}

export async function markRunMessagesInterrupted(
  executor: DbExecutor,
  runId: string,
  status: typeof MESSAGE_STATUS.INTERRUPTED | typeof MESSAGE_STATUS.ERROR,
) {
  await executor
    .update(messages)
    .set({
      status,
      completedAt: new Date(),
    })
    .where(
      and(
        eq(messages.runId, runId),
        eq(messages.status, MESSAGE_STATUS.STREAMING),
      ),
    );

  await executor.execute(sql`
    update message_parts
    set state = ${status}, updated_at = now()
    where message_id in (
      select id from messages where run_id = ${runId} and status = ${status}
    ) and state = ${MESSAGE_STATUS.STREAMING}
  `);
}

export async function bindMessageToRun(
  executor: DbExecutor,
  messageId: string,
  runId: string,
) {
  await executor
    .update(messages)
    .set({
      runId,
    })
    .where(eq(messages.id, messageId));
}

export async function hydrateVisibleMessagesPage(
  sessionId: string,
  beforeSequence: number | null,
  limit: number,
): Promise<SessionMessagesPageDto> {
  const rows = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.sessionId, sessionId),
        eq(messages.visibility, "visible"),
        beforeSequence === null ? undefined : lt(messages.sequence, beforeSequence),
      ),
    )
    .orderBy(desc(messages.sequence))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit).reverse();
  const messageIds = pageRows.map((row) => row.id);
  const partRows =
    messageIds.length > 0
      ? await db
          .select()
          .from(messageParts)
          .where(inArray(messageParts.messageId, messageIds))
          .orderBy(asc(messageParts.messageId), asc(messageParts.partIndex))
      : [];

  return {
    messages: toTranscriptMessages(pageRows, partRows),
    hasMore,
    nextBeforeSequence: hasMore ? rows[limit].sequence : null,
  };
}

export async function hydrateMessageById(messageId: string) {
  const [message] = await db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);

  if (!message) {
    throw new Error(`Message not found: ${messageId}`);
  }

  const partRows = await db
    .select()
    .from(messageParts)
    .where(eq(messageParts.messageId, messageId))
    .orderBy(asc(messageParts.partIndex));

  return toTranscriptMessages([message], partRows)[0];
}

export async function getExecutionMessageById(messageId: string) {
  const [message] = await db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);

  if (!message) {
    throw new Error(`Message not found: ${messageId}`);
  }

  const parts = await db
    .select()
    .from(messageParts)
    .where(eq(messageParts.messageId, messageId))
    .orderBy(asc(messageParts.partIndex));

  return {
    message,
    parts,
  };
}

export async function getCompletedTranscript(sessionId: string) {
  const rows = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.sessionId, sessionId),
        eq(messages.status, MESSAGE_STATUS.COMPLETED),
      ),
    )
    .orderBy(asc(messages.sequence));

  const messageIds = rows.map((row) => row.id);
  const partRows =
    messageIds.length > 0
      ? await db
          .select()
          .from(messageParts)
          .where(inArray(messageParts.messageId, messageIds))
          .orderBy(asc(messageParts.messageId), asc(messageParts.partIndex))
      : [];

  return { messages: rows, parts: partRows };
}

export interface ExecutionMessageContentPart {
  partIndex: number;
  kind: MessagePartKindValue;
  textContent: string | null;
  payload: Record<string, unknown> | null;
}

export function messagePartRowToExecutionContentPart(
  part: typeof messageParts.$inferSelect,
): ExecutionMessageContentPart {
  return {
    partIndex: part.partIndex,
    kind: part.kind,
    textContent: part.textContent,
    payload: part.payload as Record<string, unknown> | null,
  };
}

function extractVisibleText(
  message: TranscriptMessageDto | undefined,
): string | null {
  if (!message) {
    return null;
  }

  const text = message.parts
    .filter((part) => part.kind === "text" && part.textContent)
    .map((part) => part.textContent?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n")
    .trim();

  return text.length > 0 ? text : null;
}

export async function getSessionPresentationSeed(sessionId: string) {
  const rows = await db
    .select()
    .from(messages)
    .where(and(eq(messages.sessionId, sessionId), eq(messages.visibility, "visible")))
    .orderBy(asc(messages.sequence))
    .limit(8);

  if (rows.length === 0) {
    return null;
  }

  const messageIds = rows.map((row) => row.id);
  const partRows = await db
    .select()
    .from(messageParts)
    .where(inArray(messageParts.messageId, messageIds))
    .orderBy(asc(messageParts.messageId), asc(messageParts.partIndex));

  const transcript = toTranscriptMessages(rows, partRows);
  const userMessage = transcript.find((message) => message.role === "user");
  const assistantMessage = transcript.find(
    (message) =>
      message.role === "assistant" &&
      message.status !== MESSAGE_STATUS.STREAMING,
  );

  const userText = extractVisibleText(userMessage);
  const assistantText = extractVisibleText(assistantMessage);

  if (!userText || !assistantText) {
    return null;
  }

  return {
    userText,
    assistantText,
  };
}
