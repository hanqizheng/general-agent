import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { genUserId } from "@/lib/id";

import {
  createdAtColumn,
  nullableTimestamp,
  updatedAtColumn,
} from "./shared";

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey().$defaultFn(genUserId),
    name: text("name"),
    email: text("email").notNull(),
    emailVerified: nullableTimestamp("email_verified"),
    image: text("image"),
    passwordHash: text("password_hash"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    primaryKey({
      columns: [table.provider, table.providerAccountId],
      name: "accounts_provider_provider_account_id_pk",
    }),
    index("accounts_user_id_idx").on(table.userId),
  ],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    sessionToken: text("session_token").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: nullableTimestamp("expires").notNull(),
  },
  (table) => [index("auth_sessions_user_id_idx").on(table.userId)],
);

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: nullableTimestamp("expires").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.identifier, table.token],
      name: "verification_tokens_identifier_token_pk",
    }),
  ],
);
