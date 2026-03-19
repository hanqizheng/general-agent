import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { sessions } from "@/db/schema";
import type { SessionDetailDto, SessionSummaryDto } from "@/lib/session-dto";
import { genSessionId } from "@/lib/id";
import { SESSION_STATUS } from "@/lib/constants";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbExecutor = typeof db | DbTransaction;

function toSummary(row: typeof sessions.$inferSelect): SessionSummaryDto {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
  };
}

function toDetail(row: typeof sessions.$inferSelect): SessionDetailDto {
  return {
    ...toSummary(row),
    activeRunId: row.activeRunId,
    workspaceRoot: row.workspaceRoot,
  };
}

export async function createSession(workspaceRoot: string) {
  const session = {
    id: genSessionId(),
    title: "New Chat",
    status: SESSION_STATUS.IDLE,
    workspaceRoot,
  };

  const [created] = await db.insert(sessions).values(session).returning();
  return toDetail(created);
}

export async function getSessionDetail(sessionId: string) {
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), isNull(sessions.deletedAt)))
    .limit(1);

  return row ? toDetail(row) : null;
}

export async function listSessionSummaries(limit = 50) {
  const rows = await db
    .select()
    .from(sessions)
    .where(isNull(sessions.deletedAt))
    .orderBy(desc(sessions.lastMessageAt), desc(sessions.createdAt))
    .limit(limit);

  return rows.map(toSummary);
}

export async function findLatestSession() {
  const [row] = await db
    .select()
    .from(sessions)
    .where(isNull(sessions.deletedAt))
    .orderBy(desc(sessions.lastMessageAt), desc(sessions.createdAt))
    .limit(1);

  return row ? toDetail(row) : null;
}

export async function lockSession(executor: DbExecutor, sessionId: string) {
  const [row] = await executor
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), isNull(sessions.deletedAt)))
    .for("update")
    .limit(1);

  return row ?? null;
}

export async function allocateNextSequence(
  executor: DbExecutor,
  sessionId: string,
) {
  const [row] = await executor
    .update(sessions)
    .set({
      nextSequence: sql`${sessions.nextSequence} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.deletedAt)))
    .returning({
      sequence: sql<number>`${sessions.nextSequence} - 1`,
    });

  if (!row) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  return row.sequence;
}

export async function markSessionRunState(
  executor: DbExecutor,
  sessionId: string,
  activeRunId: string | null,
  status: (typeof SESSION_STATUS)[keyof typeof SESSION_STATUS],
) {
  const [row] = await executor
    .update(sessions)
    .set({
      activeRunId,
      status,
      updatedAt: new Date(),
    })
    .where(eq(sessions.id, sessionId))
    .returning();

  if (!row) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  return row;
}

export async function touchSession(
  executor: DbExecutor,
  sessionId: string,
  at = new Date(),
) {
  await executor
    .update(sessions)
    .set({
      lastMessageAt: at,
      updatedAt: at,
    })
    .where(eq(sessions.id, sessionId));
}

export async function maybePromoteSessionTitle(
  executor: DbExecutor,
  sessionId: string,
  sequence: number,
  text: string,
) {
  if (sequence !== 1) {
    return;
  }

  const title = text.trim().slice(0, 80) || "New Chat";
  await executor
    .update(sessions)
    .set({
      title,
      updatedAt: new Date(),
    })
    .where(eq(sessions.id, sessionId));
}

export async function updateSessionPresentation(
  executor: DbExecutor,
  sessionId: string,
  input: {
    title?: string;
    titleSource?: "fallback" | "ai";
  },
) {
  const [current] = await executor
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), isNull(sessions.deletedAt)))
    .limit(1);

  if (!current) {
    return null;
  }

  const nextMetadata = {
    ...current.metadata,
    ...(input.titleSource ? { titleSource: input.titleSource } : {}),
    titleUpdatedAt: new Date().toISOString(),
  };

  const [row] = await executor
    .update(sessions)
    .set({
      ...(input.title ? { title: input.title } : {}),
      metadata: nextMetadata,
      updatedAt: new Date(),
    })
    .where(eq(sessions.id, sessionId))
    .returning();

  return row ? toDetail(row) : null;
}

export async function softDeleteSession(sessionId: string) {
  const [row] = await db
    .update(sessions)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.deletedAt)))
    .returning();

  return row ? toDetail(row) : null;
}
