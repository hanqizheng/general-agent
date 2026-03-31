import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import {
  createdAtColumn,
  type MessagePartPayload,
  messagePartKindValues,
  messagePartStateValues,
  nullableTimestamp,
  textEnumColumn,
} from "./shared";
import { messages } from "./messages";

export const messageParts = pgTable(
  "message_parts",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    partIndex: integer("part_index").notNull(),
    kind: textEnumColumn("kind", messagePartKindValues).notNull(),
    state: textEnumColumn("state", messagePartStateValues).notNull(),
    textContent: text("text_content"),
    payload: jsonb("payload")
      .$type<MessagePartPayload>()
      .notNull()
      .default({}),
    createdAt: createdAtColumn(),
    updatedAt: nullableTimestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("message_parts_message_part_index_unique").on(
      table.messageId,
      table.partIndex,
    ),
    index("message_parts_message_part_index_idx").on(
      table.messageId,
      table.partIndex,
    ),
  ],
);
