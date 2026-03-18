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
  MessagePartStateValue,
  MessageRoleValue,
  MessageStatusValue,
  MessageVisibilityValue,
} from "@/db/schema";
import {
  allocateNextSequence,
  maybePromoteSessionTitle,
  touchSession,
} from "./session-repository";
import { genMessageId, genPartId } from "@/lib/id";
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
  if (state === "streaming") {
    return null;
  }

  return state === "completed" ? "complete" : "error";
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
      payload: part.payload,
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
  }));
}

export async function insertVisibleUserMessage(
  executor: DbExecutor,
  input: Omit<InsertTextMessageInput, "role" | "visibility" | "status"> & {
    text: string;
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
      status: "completed",
      createdAt: now,
      completedAt: now,
    })
    .returning();

  await executor.insert(messageParts).values({
    id: genPartId(),
    messageId,
    partIndex: 0,
    kind: "text",
    state: "completed",
    textContent: input.text,
    payload: {},
    createdAt: now,
    updatedAt: now,
  });

  await touchSession(executor, input.sessionId, now);
  await maybePromoteSessionTitle(executor, input.sessionId, sequence, input.text);

  return message;
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
      status: "streaming",
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
      status: "streaming",
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
    kind: "text" | "reasoning" | "tool_use" | "tool_result";
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
      completedAt: status === "streaming" ? null : new Date(),
    })
    .where(eq(messages.id, messageId));
}

export async function markRunMessagesInterrupted(
  executor: DbExecutor,
  runId: string,
  status: "interrupted" | "error",
) {
  await executor
    .update(messages)
    .set({
      status,
      completedAt: new Date(),
    })
    .where(and(eq(messages.runId, runId), eq(messages.status, "streaming")));

  await executor.execute(sql`
    update message_parts
    set state = ${status}, updated_at = now()
    where message_id in (
      select id from messages where run_id = ${runId} and status = ${status}
    ) and state = 'streaming'
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

export async function getCompletedTranscript(sessionId: string) {
  const rows = await db
    .select()
    .from(messages)
    .where(and(eq(messages.sessionId, sessionId), eq(messages.status, "completed")))
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
