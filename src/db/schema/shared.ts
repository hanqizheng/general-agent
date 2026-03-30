import { sql } from "drizzle-orm";
import { integer, jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { MESSAGE_STATUS, SESSION_STATUS } from "@/lib/constants";
import type { ArtifactPartPayload } from "@/lib/artifact-types";
import { MESSAGE_PART_KIND } from "@/lib/constants";
import type {
  AttachmentPartPayload,
  TextPartPayload,
} from "@/lib/attachment-types";

export const sessionStatusValues = [
  SESSION_STATUS.IDLE,
  SESSION_STATUS.BUSY,
  SESSION_STATUS.ERROR,
] as const;
export const runStatusValues = [
  "queued",
  "running",
  "completed",
  "failed",
  "aborted",
  "interrupted",
] as const;
export const messageRoleValues = ["user", "assistant"] as const;
export const messageVisibilityValues = ["visible", "internal"] as const;
export const messageStatusValues = [
  MESSAGE_STATUS.STREAMING,
  MESSAGE_STATUS.COMPLETED,
  MESSAGE_STATUS.ERROR,
  MESSAGE_STATUS.INTERRUPTED,
] as const;
export const messagePartKindValues = [
  MESSAGE_PART_KIND.TEXT,
  MESSAGE_PART_KIND.ATTACHMENT,
  MESSAGE_PART_KIND.REASONING,
  "tool_use",
  "tool_result",
  MESSAGE_PART_KIND.ARTIFACT,
] as const;
export const messagePartStateValues = [
  "streaming",
  "completed",
  "error",
  "interrupted",
] as const;
export const transientArtifactStatusValues = [
  "uploaded",
  "in_use",
  "expired",
  "failed",
] as const;
export const transientArtifactStorageDriverValues = ["local"] as const;
export const transientArtifactRetentionPolicyValues = [
  "delete_after_run",
] as const;

export type SessionStatusValue = (typeof sessionStatusValues)[number];
export type RunStatusValue = (typeof runStatusValues)[number];
export type MessageRoleValue = (typeof messageRoleValues)[number];
export type MessageVisibilityValue = (typeof messageVisibilityValues)[number];
export type MessageStatusValue = (typeof messageStatusValues)[number];
export type MessagePartKindValue = (typeof messagePartKindValues)[number];
export type MessagePartStateValue = (typeof messagePartStateValues)[number];
export type TransientArtifactStatusValue =
  (typeof transientArtifactStatusValues)[number];
export type TransientArtifactStorageDriverValue =
  (typeof transientArtifactStorageDriverValues)[number];
export type TransientArtifactRetentionPolicyValue =
  (typeof transientArtifactRetentionPolicyValues)[number];

export type MessagePartPayload =
  | Record<string, never>
  | TextPartPayload
  | AttachmentPartPayload
  | {
      toolCallId: string;
      toolName: string;
      input: Record<string, unknown>;
    }
  | {
      toolCallId: string;
      isError: boolean;
      durationMs: number | null;
      error: string | null;
      interrupted?: boolean;
    }
  | ArtifactPartPayload;

export function textEnumColumn<TValues extends readonly [string, ...string[]]>(
  name: string,
  values: TValues,
) {
  return text(name, { enum: values });
}

export function metadataJsonColumn(name: string) {
  return jsonb(name)
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`);
}

export function optionalText(name: string) {
  return text(name);
}

export function createdAtColumn(name = "created_at") {
  return timestamp(name, { withTimezone: true }).notNull().defaultNow();
}

export function updatedAtColumn(name = "updated_at") {
  return timestamp(name, { withTimezone: true }).notNull().defaultNow();
}

export function nullableTimestamp(name: string) {
  return timestamp(name, { withTimezone: true });
}

export function integerColumn(name: string) {
  return integer(name).notNull();
}
