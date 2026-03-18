import { index, bigint, pgTable, text } from "drizzle-orm/pg-core";

import {
  createdAtColumn,
  metadataJsonColumn,
  nullableTimestamp,
  textEnumColumn,
  transientArtifactRetentionPolicyValues,
  transientArtifactStatusValues,
  transientArtifactStorageDriverValues,
  updatedAtColumn,
} from "./shared";
import { sessions } from "./sessions";
import { messages } from "./messages";
import { agentRuns } from "./agent-runs";

export const transientArtifacts = pgTable(
  "transient_artifacts",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    messageId: text("message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    runId: text("run_id").references(() => agentRuns.id, {
      onDelete: "set null",
    }),
    status: textEnumColumn("status", transientArtifactStatusValues).notNull(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull(),
    storageDriver: textEnumColumn(
      "storage_driver",
      transientArtifactStorageDriverValues,
    ).notNull(),
    storageKey: text("storage_key").notNull(),
    retentionPolicy: textEnumColumn(
      "retention_policy",
      transientArtifactRetentionPolicyValues,
    ).notNull(),
    expiresAt: nullableTimestamp("expires_at"),
    metadata: metadataJsonColumn("metadata"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    deletedAt: nullableTimestamp("deleted_at"),
  },
  (table) => [
    index("transient_artifacts_session_status_expires_idx").on(
      table.sessionId,
      table.status,
      table.expiresAt,
    ),
  ],
);
