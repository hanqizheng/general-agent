import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";

import { db } from "@/db";
import {
  createAttachmentBinding,
  findReusableAttachmentBinding,
  listSessionAttachmentBindings,
  updateAttachmentBinding,
} from "@/db/repositories/attachment-binding-repository";
import {
  getAttachmentById,
  listSessionAttachments,
  markAttachmentStatus,
} from "@/db/repositories/attachment-repository";
import type { LLMContentBlock, LLMMessage } from "@/core/provider/base";
import { providerSupportsAttachmentInput } from "@/core/provider/attachment-capabilities";
import {
  ATTACHMENT_BINDING_METHOD,
  ATTACHMENT_BINDING_STATUS,
  ATTACHMENT_PROVIDER,
  ATTACHMENT_STATUS,
} from "@/lib/attachment-constants";
import type { AttachmentBindingSource } from "@/lib/attachment-types";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/config";
import {
  readAttachmentFile,
  removeAttachmentFile,
  resolveAttachmentStoragePath,
} from "./storage";

interface ResolveAttachmentContext {
  provider: string;
  modelFamily: string;
}

function getAnthropicClient() {
  if (!env.ANTHROPIC_AUTH_TOKEN || !env.ANTHROPIC_BASE_URL) {
    throw new AppError(
      "Anthropic provider is not configured",
      "PROVIDER_NOT_CONFIGURED",
      500,
      false,
    );
  }

  return new Anthropic({
    apiKey: env.ANTHROPIC_AUTH_TOKEN,
    baseURL: env.ANTHROPIC_BASE_URL,
  });
}

export async function resolveLLMMessageAttachments(
  message: LLMMessage,
  context: ResolveAttachmentContext,
): Promise<LLMMessage> {
  const content = await Promise.all(
    message.content.map((block) => resolveContentBlockAttachment(block, context)),
  );

  return {
    ...message,
    content,
  };
}

export async function resolveLLMMessagesAttachments(
  messages: LLMMessage[],
  context: ResolveAttachmentContext,
) {
  return Promise.all(
    messages.map((message) => resolveLLMMessageAttachments(message, context)),
  );
}

async function resolveContentBlockAttachment(
  block: LLMContentBlock,
  context: ResolveAttachmentContext,
): Promise<LLMContentBlock> {
  if (block.type !== "attachment") {
    return block;
  }

  if (block.source?.provider === context.provider) {
    return block;
  }

  const source = await resolveAttachmentSource(block, context);
  return {
    ...block,
    source,
  };
}

async function resolveAttachmentSource(
  block: Extract<LLMContentBlock, { type: "attachment" }>,
  context: ResolveAttachmentContext,
): Promise<AttachmentBindingSource> {
  const attachment = await getAttachmentById(block.attachmentId);
  if (!attachment) {
    throw new AppError(
      `Attachment not found: ${block.attachmentId}`,
      "ATTACHMENT_NOT_FOUND",
      404,
      false,
    );
  }

  if (
    !providerSupportsAttachmentInput(context.provider, {
      kind: attachment.kind,
      mimeType: attachment.mimeType,
    })
  ) {
    throw new AppError(
      `Provider "${context.provider}" does not support ${attachment.mimeType} attachments`,
      "ATTACHMENT_NOT_SUPPORTED",
      409,
      false,
    );
  }

  if (context.provider === ATTACHMENT_PROVIDER.ANTHROPIC) {
    return resolveAnthropicAttachmentSource(attachment, context.modelFamily);
  }

  throw new AppError(
    `Attachment support for provider "${context.provider}" is not implemented`,
    "ATTACHMENT_NOT_SUPPORTED",
    409,
    false,
  );
}

async function resolveAnthropicAttachmentSource(
  attachment: Awaited<ReturnType<typeof getAttachmentById>> extends infer TResult
    ? NonNullable<TResult>
    : never,
  modelFamily: string,
): Promise<AttachmentBindingSource> {
  const client = getAnthropicClient();
  const reusable = await findReusableAttachmentBinding(
    attachment.id,
    ATTACHMENT_PROVIDER.ANTHROPIC,
  );

  if (reusable) {
    if (
      reusable.bindingMethod === ATTACHMENT_BINDING_METHOD.PROVIDER_FILE_ID &&
      reusable.remoteRef
    ) {
      try {
        await client.beta.files.retrieveMetadata(reusable.remoteRef);
        await db.transaction(async (tx) => {
          await updateAttachmentBinding(tx, {
            bindingId: reusable.id,
            lastUsedAt: new Date(),
          });
        });
        return {
          provider: ATTACHMENT_PROVIDER.ANTHROPIC,
          bindingMethod: reusable.bindingMethod,
          remoteRef: reusable.remoteRef,
        };
      } catch {
        await db.transaction(async (tx) => {
          await updateAttachmentBinding(tx, {
            bindingId: reusable.id,
            status: ATTACHMENT_BINDING_STATUS.EXPIRED,
          });
        });
      }
    } else {
      await db.transaction(async (tx) => {
        await updateAttachmentBinding(tx, {
          bindingId: reusable.id,
          lastUsedAt: new Date(),
        });
      });

      if (
        reusable.bindingMethod === ATTACHMENT_BINDING_METHOD.INLINE_BASE64
      ) {
        return buildInlineBase64AttachmentSource(attachment);
      }

      return {
        provider: ATTACHMENT_PROVIDER.ANTHROPIC,
        bindingMethod: reusable.bindingMethod,
        remoteRef: reusable.remoteRef,
      };
    }
  }

  if (attachment.sourceKind === "url" && attachment.sourceUrl) {
    const remoteRef = attachment.sourceUrl;
    const binding = await db.transaction(async (tx) => {
      const created = await createAttachmentBinding(tx, {
        attachmentId: attachment.id,
        provider: ATTACHMENT_PROVIDER.ANTHROPIC,
        modelFamily,
        bindingMethod: ATTACHMENT_BINDING_METHOD.PROVIDER_URL,
        remoteRef,
        status: ATTACHMENT_BINDING_STATUS.READY,
        lastUsedAt: new Date(),
      });
      await markAttachmentStatus(tx, attachment.id, ATTACHMENT_STATUS.BOUND);
      return created;
    });

    return {
      provider: ATTACHMENT_PROVIDER.ANTHROPIC,
      bindingMethod: binding.bindingMethod,
      remoteRef: binding.remoteRef,
    };
  }

  if (attachment.sourceKind !== "upload" || !attachment.storageKey) {
    throw new AppError(
      `Attachment ${attachment.id} has no provider-bindable source`,
      "ATTACHMENT_SOURCE_INVALID",
      400,
      false,
    );
  }

  try {
    const uploaded = await client.beta.files.upload({
      file: fs.createReadStream(resolveAttachmentStoragePath(attachment.storageKey)),
    });

    const binding = await db.transaction(async (tx) => {
      const created = await createAttachmentBinding(tx, {
        attachmentId: attachment.id,
        provider: ATTACHMENT_PROVIDER.ANTHROPIC,
        modelFamily,
        bindingMethod: ATTACHMENT_BINDING_METHOD.PROVIDER_FILE_ID,
        remoteRef: uploaded.id,
        status: ATTACHMENT_BINDING_STATUS.READY,
        lastUsedAt: new Date(),
        metadata: {
          filename: uploaded.filename,
          mimeType: uploaded.mime_type,
          sizeBytes: uploaded.size_bytes,
        },
      });
      await markAttachmentStatus(tx, attachment.id, ATTACHMENT_STATUS.BOUND);
      return created;
    });

    return {
      provider: ATTACHMENT_PROVIDER.ANTHROPIC,
      bindingMethod: binding.bindingMethod,
      remoteRef: binding.remoteRef,
    };
  } catch (error) {
    if (attachment.storageKey) {
      return createInlineBase64AttachmentBindingSource(
        attachment,
        modelFamily,
        error,
      );
    }

    await db.transaction(async (tx) => {
      await createAttachmentBinding(tx, {
        attachmentId: attachment.id,
        provider: ATTACHMENT_PROVIDER.ANTHROPIC,
        modelFamily,
        bindingMethod: ATTACHMENT_BINDING_METHOD.PROVIDER_FILE_ID,
        remoteRef: "",
        status: ATTACHMENT_BINDING_STATUS.FAILED,
        lastUsedAt: new Date(),
        metadata: {
          error: error instanceof Error ? error.message : "Unknown upload error",
        },
      });
      await markAttachmentStatus(tx, attachment.id, ATTACHMENT_STATUS.FAILED);
    });

    throw new AppError(
      error instanceof Error ? error.message : "Failed to upload attachment",
      "ATTACHMENT_BINDING_FAILED",
      502,
      false,
    );
  }
}

async function buildInlineBase64AttachmentSource(
  attachment: Awaited<ReturnType<typeof getAttachmentById>> extends infer TResult
    ? NonNullable<TResult>
    : never,
): Promise<AttachmentBindingSource> {
  if (!attachment.storageKey) {
    throw new AppError(
      `Attachment ${attachment.id} cannot be encoded inline without local storage`,
      "ATTACHMENT_SOURCE_INVALID",
      400,
      false,
    );
  }

  const file = await readAttachmentFile(attachment.storageKey);
  return {
    provider: ATTACHMENT_PROVIDER.ANTHROPIC,
    bindingMethod: ATTACHMENT_BINDING_METHOD.INLINE_BASE64,
    remoteRef: file.toString("base64"),
  };
}

async function createInlineBase64AttachmentBindingSource(
  attachment: Awaited<ReturnType<typeof getAttachmentById>> extends infer TResult
    ? NonNullable<TResult>
    : never,
  modelFamily: string,
  uploadError: unknown,
): Promise<AttachmentBindingSource> {
  await db.transaction(async (tx) => {
    await createAttachmentBinding(tx, {
      attachmentId: attachment.id,
      provider: ATTACHMENT_PROVIDER.ANTHROPIC,
      modelFamily,
      bindingMethod: ATTACHMENT_BINDING_METHOD.INLINE_BASE64,
      remoteRef: attachment.storageKey ?? attachment.id,
      status: ATTACHMENT_BINDING_STATUS.READY,
      lastUsedAt: new Date(),
      metadata: {
        fallbackReason:
          uploadError instanceof Error
            ? uploadError.message
            : "Anthropic file upload failed",
      },
    });
    await markAttachmentStatus(tx, attachment.id, ATTACHMENT_STATUS.BOUND);
  });

  return buildInlineBase64AttachmentSource(attachment);
}

export async function cleanupSessionAttachments(sessionId: string) {
  const client =
    env.ANTHROPIC_AUTH_TOKEN && env.ANTHROPIC_BASE_URL ? getAnthropicClient() : null;
  const rows = await listSessionAttachmentBindings(sessionId);
  const attachments = await listSessionAttachments(sessionId);
  const removedStorageKeys = new Set<string>();

  for (const row of rows) {
    if (
      client &&
      row.binding.provider === ATTACHMENT_PROVIDER.ANTHROPIC &&
      row.binding.bindingMethod === ATTACHMENT_BINDING_METHOD.PROVIDER_FILE_ID &&
      row.binding.remoteRef
    ) {
      try {
        await client.beta.files.delete(row.binding.remoteRef);
      } catch {
        // Best effort cleanup only.
      }
    }

    await db.transaction(async (tx) => {
      await updateAttachmentBinding(tx, {
        bindingId: row.binding.id,
        status: ATTACHMENT_BINDING_STATUS.EXPIRED,
      });
      await markAttachmentStatus(tx, row.attachment.id, ATTACHMENT_STATUS.EXPIRED);
    });
  }

  for (const attachment of attachments) {
    if (attachment.storageKey && !removedStorageKeys.has(attachment.storageKey)) {
      removedStorageKeys.add(attachment.storageKey);
      await removeAttachmentFile(attachment.storageKey).catch(() => undefined);
    }
  }
}
