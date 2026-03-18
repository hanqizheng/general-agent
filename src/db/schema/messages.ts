import {
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import {
  createdAtColumn,
  messageRoleValues,
  messageStatusValues,
  messageVisibilityValues,
  metadataJsonColumn,
  nullableTimestamp,
  textEnumColumn,
} from "./shared";
import { sessions } from "./sessions";
import { agentRuns } from "./agent-runs";

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    runId: text("run_id").references(() => agentRuns.id, {
      onDelete: "set null",
    }),
    sequence: integer("sequence").notNull(),
    turnIndex: integer("turn_index"),
    role: textEnumColumn("role", messageRoleValues).notNull(),
    visibility: textEnumColumn("visibility", messageVisibilityValues).notNull(),
    status: textEnumColumn("status", messageStatusValues).notNull(),
    metadata: metadataJsonColumn("metadata"),
    createdAt: createdAtColumn(),
    completedAt: nullableTimestamp("completed_at"),
  },
  (table) => [
    uniqueIndex("messages_session_sequence_unique").on(
      table.sessionId,
      table.sequence,
    ),
    index("messages_session_sequence_idx").on(table.sessionId, table.sequence),
  ],
);
