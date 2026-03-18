import { index, pgTable, text } from "drizzle-orm/pg-core";

import {
  createdAtColumn,
  nullableTimestamp,
  runStatusValues,
  textEnumColumn,
} from "./shared";
import { sessions } from "./sessions";

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    requestMessageId: text("request_message_id").notNull(),
    status: textEnumColumn("status", runStatusValues).notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    systemPromptHash: text("system_prompt_hash").notNull(),
    startedAt: nullableTimestamp("started_at"),
    endedAt: nullableTimestamp("ended_at"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: createdAtColumn(),
  },
  (table) => [index("agent_runs_session_status_idx").on(table.sessionId, table.status)],
);
