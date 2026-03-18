import { index, integer, pgTable, text } from "drizzle-orm/pg-core";

import {
  createdAtColumn,
  metadataJsonColumn,
  nullableTimestamp,
  sessionStatusValues,
  textEnumColumn,
  updatedAtColumn,
} from "./shared";

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    status: textEnumColumn("status", sessionStatusValues).notNull(),
    activeRunId: text("active_run_id"),
    nextSequence: integer("next_sequence").notNull().default(1),
    workspaceRoot: text("workspace_root").notNull(),
    lastMessageAt: nullableTimestamp("last_message_at"),
    metadata: metadataJsonColumn("metadata"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    deletedAt: nullableTimestamp("deleted_at"),
  },
  (table) => [
    index("sessions_deleted_last_message_idx").on(
      table.deletedAt,
      table.lastMessageAt,
    ),
  ],
);
