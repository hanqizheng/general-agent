import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";

import { db } from "@/db";
import { agentRuns } from "@/db/schema";
import { genRunId } from "@/lib/id";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbExecutor = typeof db | DbTransaction;

interface CreateRunInput {
  sessionId: string;
  requestMessageId: string;
  provider: string;
  model: string;
  systemPromptHash: string;
}

export async function createQueuedRun(
  executor: DbExecutor,
  input: CreateRunInput,
) {
  const [row] = await executor
    .insert(agentRuns)
    .values({
      id: genRunId(),
      sessionId: input.sessionId,
      requestMessageId: input.requestMessageId,
      status: "queued",
      provider: input.provider,
      model: input.model,
      systemPromptHash: input.systemPromptHash,
    })
    .returning();

  return row;
}

export async function markRunRunning(executor: DbExecutor, runId: string) {
  const [row] = await executor
    .update(agentRuns)
    .set({
      status: "running",
      startedAt: new Date(),
    })
    .where(eq(agentRuns.id, runId))
    .returning();

  return row ?? null;
}

export async function finalizeRun(
  executor: DbExecutor,
  runId: string,
  status: "completed" | "failed" | "aborted" | "interrupted",
  error?: { code: string; message: string } | null,
) {
  const [row] = await executor
    .update(agentRuns)
    .set({
      status,
      endedAt: new Date(),
      errorCode: error?.code ?? null,
      errorMessage: error?.message ?? null,
    })
    .where(eq(agentRuns.id, runId))
    .returning();

  return row ?? null;
}

export async function getRun(runId: string) {
  const [row] = await db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.id, runId))
    .limit(1);

  return row ?? null;
}

export async function findStaleRuns(cutoff: Date) {
  return db
    .select()
    .from(agentRuns)
    .where(
      or(
        and(eq(agentRuns.status, "queued"), lt(agentRuns.createdAt, cutoff)),
        and(
          eq(agentRuns.status, "running"),
          or(isNull(agentRuns.startedAt), lt(agentRuns.startedAt, cutoff)),
        ),
      ),
    );
}

export async function findStaleRunsForSession(sessionId: string, cutoff: Date) {
  return db
    .select()
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.sessionId, sessionId),
        or(
          and(eq(agentRuns.status, "queued"), lt(agentRuns.createdAt, cutoff)),
          and(
            eq(agentRuns.status, "running"),
            or(isNull(agentRuns.startedAt), lt(agentRuns.startedAt, cutoff)),
          ),
        ),
      ),
    );
}

export async function finalizeRuns(
  executor: DbExecutor,
  runIds: string[],
  status: "interrupted" | "aborted",
) {
  if (runIds.length === 0) {
    return [];
  }

  return executor
    .update(agentRuns)
    .set({
      status,
      endedAt: new Date(),
    })
    .where(inArray(agentRuns.id, runIds))
    .returning();
}
