"use client";

import type { UIToolPart } from "@/lib/chat-types";
import { TOOL_CALL_STATUS } from "@/lib/constants";

const INPUT_SUMMARY_PRIORITY = [
  "query",
  "command",
  "file_path",
  "filePath",
  "path",
  "url",
  "pattern",
  "prompt",
  "message",
  "content",
  "name",
] as const;

function truncate(value: string, maxLength = 220) {
  return value.length > maxLength
    ? `${value.slice(0, maxLength - 3).trimEnd()}...`
    : value;
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function previewText(value: string | undefined, maxLength = 140) {
  if (!value) {
    return null;
  }

  const firstLine = value
    .split("\n")
    .map((line) => normalizeText(line))
    .find(Boolean);

  return firstLine ? truncate(firstLine, maxLength) : null;
}

function humanizeToken(value: string) {
  const withSpaces = value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2");

  return withSpaces.replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatScalar(value: unknown) {
  if (typeof value === "string") {
    const normalized = previewText(value, 180);
    return normalized ? `"${normalized}"` : null;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `${value.length} item${value.length === 1 ? "" : "s"}`;
  }

  if (value && typeof value === "object") {
    const count = Object.keys(value).length;
    return `${count} field${count === 1 ? "" : "s"}`;
  }

  return null;
}

function getInputPriority(key: string) {
  const index = INPUT_SUMMARY_PRIORITY.indexOf(
    key as (typeof INPUT_SUMMARY_PRIORITY)[number],
  );

  return index === -1 ? INPUT_SUMMARY_PRIORITY.length : index;
}

function summarizeInput(input: Record<string, unknown> | null) {
  if (!input) {
    return null;
  }

  const entries = Object.entries(input).sort(
    ([leftKey], [rightKey]) => getInputPriority(leftKey) - getInputPriority(rightKey),
  );

  if (entries.length === 0) {
    return null;
  }

  for (const [key, value] of entries) {
    const formatted = formatScalar(value);
    if (!formatted) {
      continue;
    }

    return `${humanizeToken(key)}: ${formatted}`;
  }

  return `${entries.length} parameter${entries.length === 1 ? "" : "s"}`;
}

function summarizeUpdates(part: UIToolPart) {
  const latest = part.updates[part.updates.length - 1];
  return previewText(latest, 160);
}

function summarizeOutput(part: UIToolPart) {
  return previewText(part.error ?? part.output, 180);
}

function fallbackSummary(status: UIToolPart["status"]) {
  switch (status) {
    case TOOL_CALL_STATUS.PENDING:
      return "Preparing tool execution";
    case TOOL_CALL_STATUS.RUNNING:
      return "Executing";
    case TOOL_CALL_STATUS.DONE:
      return "Completed";
    case TOOL_CALL_STATUS.INTERRUPTED:
      return "Stopped before completion";
    case TOOL_CALL_STATUS.ERROR:
      return "Execution failed";
    default:
      return "Tool activity";
  }
}

export interface ToolPresentation {
  toolLabel: string;
  actionLabel: string;
  meta: string[];
}

export function getToolPresentation(part: UIToolPart): ToolPresentation {
  const toolLabel = part.toolName ? humanizeToken(part.toolName) : "Tool";
  const inputSummary = summarizeInput(part.input);
  const updateSummary = summarizeUpdates(part);
  const outputSummary = summarizeOutput(part);

  const actionLabel =
    inputSummary ??
    updateSummary ??
    outputSummary ??
    fallbackSummary(part.status);

  const meta: string[] = [];

  if (part.durationMs !== undefined) {
    meta.push(`${part.durationMs}ms`);
  }

  if (part.updates.length > 0) {
    meta.push(`${part.updates.length} update${part.updates.length === 1 ? "" : "s"}`);
  }

  return {
    toolLabel,
    actionLabel,
    meta,
  };
}
