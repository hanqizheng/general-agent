import { bigint, index, pgTable, text } from "drizzle-orm/pg-core";

import {
  ATTACHMENT_KIND,
  ATTACHMENT_MIME_TYPE,
  ATTACHMENT_SOURCE_KIND,
  ATTACHMENT_STATUS,
} from "@/lib/attachment-constants";
import type {
  AttachmentKind,
  AttachmentMimeType,
  AttachmentSourceKind,
  AttachmentStatus,
} from "@/lib/attachment-types";
import {
  createdAtColumn,
  metadataJsonColumn,
  nullableTimestamp,
  textEnumColumn,
  updatedAtColumn,
} from "./shared";
import { sessions } from "./sessions";

export const attachmentKindValues = [ATTACHMENT_KIND.DOCUMENT] as const;
export const attachmentMimeTypeValues = [ATTACHMENT_MIME_TYPE.PDF] as const;
export const attachmentSourceKindValues = [
  ATTACHMENT_SOURCE_KIND.UPLOAD,
  ATTACHMENT_SOURCE_KIND.URL,
] as const;
export const attachmentStatusValues = [
  ATTACHMENT_STATUS.PENDING,
  ATTACHMENT_STATUS.BOUND,
  ATTACHMENT_STATUS.FAILED,
  ATTACHMENT_STATUS.EXPIRED,
] as const;

export type AttachmentKindValue = AttachmentKind;
export type AttachmentMimeTypeValue = AttachmentMimeType;
export type AttachmentSourceKindValue = AttachmentSourceKind;
export type AttachmentStatusValue = AttachmentStatus;

export const attachments = pgTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    kind: textEnumColumn("kind", attachmentKindValues)
      .$type<AttachmentKindValue>()
      .notNull(),
    mimeType: textEnumColumn("mime_type", attachmentMimeTypeValues)
      .$type<AttachmentMimeTypeValue>()
      .notNull(),
    originalName: text("original_name"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    checksumSha256: text("checksum_sha256"),
    sourceKind: textEnumColumn("source_kind", attachmentSourceKindValues)
      .$type<AttachmentSourceKindValue>()
      .notNull(),
    sourceUrl: text("source_url"),
    storageKey: text("storage_key"),
    status: textEnumColumn("status", attachmentStatusValues)
      .$type<AttachmentStatusValue>()
      .notNull(),
    metadata: metadataJsonColumn("metadata"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    deletedAt: nullableTimestamp("deleted_at"),
  },
  (table) => [
    index("attachments_session_created_idx").on(table.sessionId, table.createdAt),
    index("attachments_session_status_idx").on(table.sessionId, table.status),
  ],
);
