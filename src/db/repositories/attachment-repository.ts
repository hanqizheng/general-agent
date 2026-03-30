import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import { attachments } from "@/db/schema";
import { ATTACHMENT_STATUS } from "@/lib/attachment-constants";
import type {
  AttachmentKindValue,
  AttachmentMimeTypeValue,
  AttachmentSourceKindValue,
  AttachmentStatusValue,
} from "@/db/schema";
import { genAttachmentId } from "@/lib/id";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbExecutor = typeof db | DbTransaction;
const activeAttachmentStatuses = [
  ATTACHMENT_STATUS.PENDING,
  ATTACHMENT_STATUS.BOUND,
] as const;

export async function createAttachment(
  executor: DbExecutor,
  input: {
    id?: string;
    sessionId: string;
    kind: AttachmentKindValue;
    mimeType: AttachmentMimeTypeValue;
    originalName: string | null;
    sizeBytes: number | null;
    checksumSha256: string | null;
    sourceKind: AttachmentSourceKindValue;
    sourceUrl?: string | null;
    storageKey?: string | null;
    status: AttachmentStatusValue;
    metadata?: Record<string, unknown>;
  },
) {
  const now = new Date();
  const [row] = await executor
    .insert(attachments)
    .values({
      id: input.id ?? genAttachmentId(),
      sessionId: input.sessionId,
      kind: input.kind,
      mimeType: input.mimeType,
      originalName: input.originalName,
      sizeBytes: input.sizeBytes,
      checksumSha256: input.checksumSha256,
      sourceKind: input.sourceKind,
      sourceUrl: input.sourceUrl ?? null,
      storageKey: input.storageKey ?? null,
      status: input.status,
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!row) {
    throw new Error("Failed to create attachment");
  }

  return row;
}

export async function getAttachmentById(attachmentId: string) {
  const [row] = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, attachmentId), isNull(attachments.deletedAt)))
    .limit(1);

  return row ?? null;
}

export async function getSessionAttachmentById(
  sessionId: string,
  attachmentId: string,
) {
  const [row] = await db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.sessionId, sessionId),
        eq(attachments.id, attachmentId),
        isNull(attachments.deletedAt),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function listSessionAttachmentsByIds(
  sessionId: string,
  attachmentIds: string[],
) {
  if (attachmentIds.length === 0) {
    return [];
  }

  return db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.sessionId, sessionId),
        inArray(attachments.id, attachmentIds),
        inArray(attachments.status, activeAttachmentStatuses),
        isNull(attachments.deletedAt),
      ),
    );
}

export async function listSessionActiveAttachments(sessionId: string) {
  return db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.sessionId, sessionId),
        inArray(attachments.status, activeAttachmentStatuses),
        isNull(attachments.deletedAt),
      ),
    );
}

export async function listSessionAttachments(sessionId: string) {
  return db
    .select()
    .from(attachments)
    .where(and(eq(attachments.sessionId, sessionId), isNull(attachments.deletedAt)));
}

export async function listAttachmentsByIds(attachmentIds: string[]) {
  if (attachmentIds.length === 0) {
    return [];
  }

  return db
    .select()
    .from(attachments)
    .where(
      and(inArray(attachments.id, attachmentIds), isNull(attachments.deletedAt)),
    );
}

export async function listAttachmentsByIdsIncludingDeleted(
  attachmentIds: string[],
) {
  if (attachmentIds.length === 0) {
    return [];
  }

  return db
    .select()
    .from(attachments)
    .where(inArray(attachments.id, attachmentIds));
}

export async function markAttachmentStatus(
  executor: DbExecutor,
  attachmentId: string,
  status: AttachmentStatusValue,
) {
  const [row] = await executor
    .update(attachments)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(and(eq(attachments.id, attachmentId), isNull(attachments.deletedAt)))
    .returning();

  return row ?? null;
}

export async function markAttachmentsExpired(
  executor: DbExecutor,
  attachmentIds: string[],
) {
  if (attachmentIds.length === 0) {
    return [];
  }

  return executor
    .update(attachments)
    .set({
      status: ATTACHMENT_STATUS.EXPIRED,
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(attachments.id, attachmentIds),
        isNull(attachments.deletedAt),
      ),
    )
    .returning();
}

export async function softDeleteAttachments(
  executor: DbExecutor,
  attachmentIds: string[],
) {
  if (attachmentIds.length === 0) {
    return [];
  }

  return executor
    .update(attachments)
    .set({
      status: ATTACHMENT_STATUS.EXPIRED,
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(attachments.id, attachmentIds),
        isNull(attachments.deletedAt),
      ),
    )
    .returning();
}
