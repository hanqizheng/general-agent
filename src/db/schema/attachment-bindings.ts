import { index, pgTable, text } from "drizzle-orm/pg-core";

import {
  ATTACHMENT_BINDING_METHOD,
  ATTACHMENT_BINDING_STATUS,
  ATTACHMENT_PROVIDER,
} from "@/lib/attachment-constants";
import type {
  AttachmentBindingMethod,
  AttachmentBindingStatus,
  AttachmentProvider,
} from "@/lib/attachment-types";
import {
  createdAtColumn,
  metadataJsonColumn,
  nullableTimestamp,
  textEnumColumn,
  updatedAtColumn,
} from "./shared";
import { attachments } from "./attachments";

export const attachmentBindingProviderValues = [
  ATTACHMENT_PROVIDER.ANTHROPIC,
  ATTACHMENT_PROVIDER.OPENAI,
  ATTACHMENT_PROVIDER.MOONSHOT,
] as const;
export const attachmentBindingMethodValues = [
  ATTACHMENT_BINDING_METHOD.PROVIDER_FILE_ID,
  ATTACHMENT_BINDING_METHOD.PROVIDER_URL,
  ATTACHMENT_BINDING_METHOD.INLINE_BASE64,
] as const;
export const attachmentBindingStatusValues = [
  ATTACHMENT_BINDING_STATUS.PENDING,
  ATTACHMENT_BINDING_STATUS.READY,
  ATTACHMENT_BINDING_STATUS.FAILED,
  ATTACHMENT_BINDING_STATUS.EXPIRED,
] as const;

export type AttachmentBindingProviderValue = AttachmentProvider;
export type AttachmentBindingMethodValue = AttachmentBindingMethod;
export type AttachmentBindingStatusValue = AttachmentBindingStatus;

export const attachmentBindings = pgTable(
  "attachment_bindings",
  {
    id: text("id").primaryKey(),
    attachmentId: text("attachment_id")
      .notNull()
      .references(() => attachments.id, { onDelete: "cascade" }),
    provider: textEnumColumn("provider", attachmentBindingProviderValues)
      .$type<AttachmentBindingProviderValue>()
      .notNull(),
    modelFamily: text("model_family"),
    bindingMethod: textEnumColumn("binding_method", attachmentBindingMethodValues)
      .$type<AttachmentBindingMethodValue>()
      .notNull(),
    remoteRef: text("remote_ref").notNull(),
    status: textEnumColumn("status", attachmentBindingStatusValues)
      .$type<AttachmentBindingStatusValue>()
      .notNull(),
    expiresAt: nullableTimestamp("expires_at"),
    lastUsedAt: nullableTimestamp("last_used_at"),
    metadata: metadataJsonColumn("metadata"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    deletedAt: nullableTimestamp("deleted_at"),
  },
  (table) => [
    index("attachment_bindings_attachment_provider_idx").on(
      table.attachmentId,
      table.provider,
      table.status,
    ),
    index("attachment_bindings_expires_idx").on(table.expiresAt, table.status),
  ],
);
