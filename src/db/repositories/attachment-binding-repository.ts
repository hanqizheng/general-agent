import { and, desc, eq, gt, isNull, or } from "drizzle-orm";

import { db } from "@/db";
import { attachmentBindings, attachments } from "@/db/schema";
import type {
  AttachmentBindingMethodValue,
  AttachmentBindingProviderValue,
  AttachmentBindingStatusValue,
} from "@/db/schema";
import { genAttachmentBindingId } from "@/lib/id";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbExecutor = typeof db | DbTransaction;

export async function findReusableAttachmentBinding(
  attachmentId: string,
  provider: AttachmentBindingProviderValue,
) {
  const [row] = await db
    .select()
    .from(attachmentBindings)
    .where(
      and(
        eq(attachmentBindings.attachmentId, attachmentId),
        eq(attachmentBindings.provider, provider),
        eq(attachmentBindings.status, "ready"),
        isNull(attachmentBindings.deletedAt),
        or(
          isNull(attachmentBindings.expiresAt),
          gt(attachmentBindings.expiresAt, new Date()),
        ),
      ),
    )
    .orderBy(
      desc(attachmentBindings.lastUsedAt),
      desc(attachmentBindings.createdAt),
    )
    .limit(1);

  return row ?? null;
}

export async function createAttachmentBinding(
  executor: DbExecutor,
  input: {
    attachmentId: string;
    provider: AttachmentBindingProviderValue;
    modelFamily: string | null;
    bindingMethod: AttachmentBindingMethodValue;
    remoteRef: string;
    status: AttachmentBindingStatusValue;
    expiresAt?: Date | null;
    lastUsedAt?: Date | null;
    metadata?: Record<string, unknown>;
  },
) {
  const now = new Date();
  const [row] = await executor
    .insert(attachmentBindings)
    .values({
      id: genAttachmentBindingId(),
      attachmentId: input.attachmentId,
      provider: input.provider,
      modelFamily: input.modelFamily,
      bindingMethod: input.bindingMethod,
      remoteRef: input.remoteRef,
      status: input.status,
      expiresAt: input.expiresAt ?? null,
      lastUsedAt: input.lastUsedAt ?? now,
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!row) {
    throw new Error("Failed to create attachment binding");
  }

  return row;
}

export async function touchAttachmentBinding(
  executor: DbExecutor,
  bindingId: string,
  at = new Date(),
) {
  const [row] = await executor
    .update(attachmentBindings)
    .set({
      lastUsedAt: at,
      updatedAt: at,
    })
    .where(
      and(eq(attachmentBindings.id, bindingId), isNull(attachmentBindings.deletedAt)),
    )
    .returning();

  return row ?? null;
}

export async function updateAttachmentBinding(
  executor: DbExecutor,
  input: {
    bindingId: string;
    status?: AttachmentBindingStatusValue;
    remoteRef?: string;
    expiresAt?: Date | null;
    lastUsedAt?: Date | null;
    metadata?: Record<string, unknown>;
  },
) {
  const [row] = await executor
    .update(attachmentBindings)
    .set({
      ...(input.status ? { status: input.status } : {}),
      ...(input.remoteRef !== undefined ? { remoteRef: input.remoteRef } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
      ...(input.lastUsedAt !== undefined ? { lastUsedAt: input.lastUsedAt } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(eq(attachmentBindings.id, input.bindingId), isNull(attachmentBindings.deletedAt)),
    )
    .returning();

  return row ?? null;
}

export async function listSessionAttachmentBindings(sessionId: string) {
  return db
    .select({
      binding: attachmentBindings,
      attachment: attachments,
    })
    .from(attachmentBindings)
    .innerJoin(attachments, eq(attachmentBindings.attachmentId, attachments.id))
    .where(
      and(
        eq(attachments.sessionId, sessionId),
        isNull(attachments.deletedAt),
        isNull(attachmentBindings.deletedAt),
      ),
    );
}
