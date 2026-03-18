import { db } from "@/db";
import {
  markRunMessagesInterrupted,
} from "@/db/repositories/message-repository";
import {
  finalizeRun,
  findStaleRuns,
  findStaleRunsForSession,
} from "@/db/repositories/run-repository";
import { getSessionDetail, markSessionRunState } from "@/db/repositories/session-repository";
import { liveSessionRegistry } from "./live-session-registry";
import { env } from "@/lib/config";

function getStaleCutoff() {
  const staleMs = env.SESSION_STALE_RUN_MS ?? 30_000;
  return new Date(Date.now() - staleMs);
}

export async function markAllStaleRunsInterrupted() {
  const staleRuns = await findStaleRuns(getStaleCutoff());

  for (const run of staleRuns) {
    await db.transaction(async (tx) => {
      await finalizeRun(tx, run.id, "interrupted", {
        code: "STALE_RUN",
        message: "Recovered stale run during startup",
      });
      await markRunMessagesInterrupted(tx, run.id, "interrupted");
      await markSessionRunState(tx, run.sessionId, null, "idle");
    });
  }
}

export async function repairSessionIfStale(sessionId: string) {
  if (liveSessionRegistry.hasActiveRun(sessionId)) {
    return;
  }

  const session = await getSessionDetail(sessionId);
  if (!session?.activeRunId) {
    return;
  }

  const staleRuns = await findStaleRunsForSession(sessionId, getStaleCutoff());
  for (const run of staleRuns) {
    await db.transaction(async (tx) => {
      await finalizeRun(tx, run.id, "interrupted", {
        code: "STALE_RUN",
        message: "Recovered stale run on session access",
      });
      await markRunMessagesInterrupted(tx, run.id, "interrupted");
      await markSessionRunState(tx, sessionId, null, "idle");
    });
  }
}
