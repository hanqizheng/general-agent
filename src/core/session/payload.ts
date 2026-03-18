import { z } from "zod";

export const emptyPayloadSchema = z.object({}).passthrough();

export const toolUsePayloadSchema = z.object({
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
});

export const toolResultPayloadSchema = z.object({
  toolCallId: z.string().min(1),
  isError: z.boolean(),
  durationMs: z.number().int().nonnegative().nullable(),
  error: z.string().nullable(),
});

export function validateTextPayload(payload: unknown) {
  return emptyPayloadSchema.parse(payload);
}

export function validateToolUsePayload(payload: unknown) {
  return toolUsePayloadSchema.parse(payload);
}

export function validateToolResultPayload(payload: unknown) {
  return toolResultPayloadSchema.parse(payload);
}
