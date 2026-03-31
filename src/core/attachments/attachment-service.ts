import { createHash } from "node:crypto";

import { db } from "@/db";
import {
  createAttachment,
  getSessionAttachmentById,
  softDeleteAttachments,
} from "@/db/repositories/attachment-repository";
import { attachmentHasMessageReference } from "@/db/repositories/message-repository";
import {
  ATTACHMENT_KIND,
  ATTACHMENT_MIME_TYPE,
  ATTACHMENT_SOURCE_KIND,
  ATTACHMENT_STATUS,
  MAX_ATTACHMENT_UPLOAD_BYTES,
} from "@/lib/attachment-constants";
import { AppError } from "@/lib/errors";
import { genAttachmentId } from "@/lib/id";
import {
  expireAttachmentsInStore,
  purgeAttachmentResourcesByIds,
} from "./binding-service";
import { removeAttachmentFile, writeAttachmentFile } from "./storage";
import {
  fetchSafeAttachmentHead,
  UnsafeAttachmentUrlError,
} from "./url-safety";

function isPdfContent(buffer: Uint8Array) {
  if (buffer.length < 5) {
    return false;
  }

  return Buffer.from(buffer.subarray(0, 5)).toString("utf8") === "%PDF-";
}

function sha256(input: Uint8Array) {
  return createHash("sha256").update(input).digest("hex");
}

function normalizeOriginalName(originalName: string | null) {
  const trimmed = originalName?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function ensurePdfFilename(candidate: string | null) {
  return candidate?.toLowerCase().endsWith(".pdf") ?? false;
}

function parseContentLength(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isPdfContentType(value: string | null) {
  return value?.toLowerCase().includes(ATTACHMENT_MIME_TYPE.PDF) ?? false;
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (bytes >= 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${bytes} B`;
}

export async function createAttachmentFromUpload(
  sessionId: string,
  file: File,
) {
  if (file.size <= 0) {
    throw new AppError("Attachment file is empty", "ATTACHMENT_EMPTY", 400, false);
  }

  if (file.size > MAX_ATTACHMENT_UPLOAD_BYTES) {
    throw new AppError(
      `Attachment exceeds ${formatBytes(MAX_ATTACHMENT_UPLOAD_BYTES)}`,
      "ATTACHMENT_TOO_LARGE",
      400,
      false,
    );
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  if (!isPdfContent(buffer)) {
    throw new AppError(
      "Only PDF attachments are supported",
      "ATTACHMENT_UNSUPPORTED_TYPE",
      400,
      false,
    );
  }

  const attachmentId = genAttachmentId();
  const originalName = normalizeOriginalName(file.name);
  const storageKey = await writeAttachmentFile(attachmentId, buffer, originalName);

  try {
    return await db.transaction(async (tx) =>
      createAttachment(tx, {
        id: attachmentId,
        sessionId,
        kind: ATTACHMENT_KIND.DOCUMENT,
        mimeType: ATTACHMENT_MIME_TYPE.PDF,
        originalName,
        sizeBytes: file.size,
        checksumSha256: sha256(buffer),
        sourceKind: ATTACHMENT_SOURCE_KIND.UPLOAD,
        storageKey,
        status: ATTACHMENT_STATUS.PENDING,
        metadata: {},
      }),
    );
  } catch (error) {
    await removeAttachmentFile(storageKey).catch(() => undefined);
    throw error;
  }
}

export async function createAttachmentFromUrl(
  sessionId: string,
  url: string,
  originalName?: string | null,
) {
  const urlObject = new URL(url);
  let response: Awaited<ReturnType<typeof fetchSafeAttachmentHead>> | null = null;

  try {
    response = await fetchSafeAttachmentHead(urlObject);
  } catch (error) {
    if (error instanceof UnsafeAttachmentUrlError) {
      throw new AppError(
        error.message,
        "ATTACHMENT_URL_NOT_ALLOWED",
        400,
        false,
      );
    }

    response = null;
  }

  const normalizedOriginalName = normalizeOriginalName(originalName ?? null);
  const inferredName =
    normalizedOriginalName ??
    (urlObject.pathname.split("/").pop()?.trim() || null);
  const contentType = response?.headers.get("content-type") ?? null;
  const sizeBytes = parseContentLength(
    response?.headers.get("content-length") ?? null,
  );

  if (!isPdfContentType(contentType) && !ensurePdfFilename(inferredName)) {
    throw new AppError(
      "Only PDF attachment URLs are supported",
      "ATTACHMENT_UNSUPPORTED_TYPE",
      400,
      false,
    );
  }

  if (sizeBytes !== null && sizeBytes > MAX_ATTACHMENT_UPLOAD_BYTES) {
    throw new AppError(
      `Attachment exceeds ${formatBytes(MAX_ATTACHMENT_UPLOAD_BYTES)}`,
      "ATTACHMENT_TOO_LARGE",
      400,
      false,
    );
  }

  return db.transaction(async (tx) =>
    createAttachment(tx, {
      sessionId,
      kind: ATTACHMENT_KIND.DOCUMENT,
      mimeType: ATTACHMENT_MIME_TYPE.PDF,
      originalName: inferredName,
      sizeBytes,
      checksumSha256: null,
      sourceKind: ATTACHMENT_SOURCE_KIND.URL,
      sourceUrl: url,
      status: ATTACHMENT_STATUS.PENDING,
      metadata: {
        headStatus: response?.status ?? null,
        contentType,
      },
    }),
  );
}

export async function deleteDraftAttachment(
  sessionId: string,
  attachmentId: string,
) {
  const attachment = await getSessionAttachmentById(sessionId, attachmentId);
  if (!attachment) {
    throw new AppError(
      "Attachment not found",
      "ATTACHMENT_NOT_FOUND",
      404,
      false,
    );
  }

  const inUse = await attachmentHasMessageReference(sessionId, attachmentId);
  if (inUse) {
    throw new AppError(
      "Attachment is already referenced by a message",
      "ATTACHMENT_IN_USE",
      409,
      false,
    );
  }

  await db.transaction(async (tx) => {
    await expireAttachmentsInStore(tx, [attachmentId]);
    await softDeleteAttachments(tx, [attachmentId]);
  });

  await purgeAttachmentResourcesByIds([attachmentId]);
}
