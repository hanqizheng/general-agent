import { db } from "@/db";
import {
  hydrateMessageById,
  markRunMessagesInterrupted,
} from "@/db/repositories/message-repository";
import {
  finalizeRun,
  findStaleRuns,
  findStaleRunsForSession,
} from "@/db/repositories/run-repository";
import {
  expireAttachmentsInStore,
  purgeAttachmentResourcesByIds,
} from "@/core/attachments/binding-service";
import {
  getSessionDetailInternal,
  markSessionRunState,
} from "@/db/repositories/session-repository";
import { liveSessionRegistry } from "./live-session-registry";
import { env } from "@/lib/config";
import type { TranscriptMessageDto } from "@/lib/session-dto";

function getStaleCutoff() {
  const staleMs = env.SESSION_STALE_RUN_MS ?? 30_000;
  return new Date(Date.now() - staleMs);
}

function extractAttachmentIds(message: TranscriptMessageDto | null) {
  if (!message) {
    return [];
  }

  return Array.from(
    new Set(
      message.parts.flatMap((part) =>
        part.kind === "attachment" && typeof part.payload.attachmentId === "string"
          ? [part.payload.attachmentId]
          : [],
      ),
    ),
  );
}

export async function markAllStaleRunsInterrupted() {
  const staleRuns = await findStaleRuns(getStaleCutoff());

  for (const run of staleRuns) {
    const requestMessage = await hydrateMessageById(run.requestMessageId).catch(
      () => null,
    );
    const attachmentIds = extractAttachmentIds(requestMessage);

    await db.transaction(async (tx) => {
      await finalizeRun(tx, run.id, "interrupted", {
        code: "STALE_RUN",
        message: "Recovered stale run during startup",
      });
      await markRunMessagesInterrupted(tx, run.id, "interrupted");
      await markSessionRunState(tx, run.sessionId, null, "idle");
      await expireAttachmentsInStore(tx, attachmentIds);
    });

    await purgeAttachmentResourcesByIds(attachmentIds).catch(() => undefined);
  }
}

export async function repairSessionIfStale(sessionId: string) {
  if (liveSessionRegistry.hasActiveRun(sessionId)) {
    return;
  }

  const session = await getSessionDetailInternal(sessionId);
  if (!session?.activeRunId) {
    return;
  }

  const staleRuns = await findStaleRunsForSession(sessionId, getStaleCutoff());
  for (const run of staleRuns) {
    const requestMessage = await hydrateMessageById(run.requestMessageId).catch(
      () => null,
    );
    const attachmentIds = extractAttachmentIds(requestMessage);

    await db.transaction(async (tx) => {
      await finalizeRun(tx, run.id, "interrupted", {
        code: "STALE_RUN",
        message: "Recovered stale run on session access",
      });
      await markRunMessagesInterrupted(tx, run.id, "interrupted");
      await markSessionRunState(tx, sessionId, null, "idle");
      await expireAttachmentsInStore(tx, attachmentIds);
    });

    await purgeAttachmentResourcesByIds(attachmentIds).catch(() => undefined);
  }
}
