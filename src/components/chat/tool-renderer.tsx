"use client";

import { useState, type ReactNode } from "react";

import type { UIToolPart } from "@/lib/chat-types";
import { TOOL_CALL_STATUS } from "@/lib/constants";
import { getToolPresentation } from "./tool-presentation";

interface ToolRendererProps {
  part: UIToolPart;
  detailsAccessory?: ReactNode;
}

function formatJson(value: Record<string, unknown> | null) {
  if (!value) {
    return "No input payload";
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Unable to serialize tool input";
  }
}

function getStatusClasses(status: UIToolPart["status"]) {
  switch (status) {
    case TOOL_CALL_STATUS.PENDING:
      return "bg-sky-100 text-sky-800";
    case TOOL_CALL_STATUS.RUNNING:
      return "bg-amber-100 text-amber-800";
    case TOOL_CALL_STATUS.DONE:
      return "bg-emerald-100 text-emerald-800";
    case TOOL_CALL_STATUS.INTERRUPTED:
      return "bg-stone-200 text-stone-700";
    case TOOL_CALL_STATUS.ERROR:
      return "bg-rose-100 text-rose-800";
    default:
      return "bg-stone-100 text-stone-700";
  }
}

function getStatusLabel(status: UIToolPart["status"]) {
  switch (status) {
    case TOOL_CALL_STATUS.PENDING:
      return "Pending";
    case TOOL_CALL_STATUS.RUNNING:
      return "Running";
    case TOOL_CALL_STATUS.DONE:
      return "Done";
    case TOOL_CALL_STATUS.INTERRUPTED:
      return "Stopped";
    case TOOL_CALL_STATUS.ERROR:
      return "Error";
    default:
      return "Unknown";
  }
}

export function ToolRenderer({
  part,
  detailsAccessory,
}: ToolRendererProps) {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const presentation = getToolPresentation(part);
  const hasRawInput = part.input !== null;
  const hasRawOutput = Boolean(part.output || part.error);
  const hasUpdates = part.updates.length > 0;
  const hasDetails = hasRawInput || hasRawOutput || hasUpdates;

  return (
    <section className="min-w-0 overflow-hidden rounded-3xl px-3 py-3 text-stone-900 sm:px-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex flex-1 items-center gap-3">
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${
              part.status === TOOL_CALL_STATUS.RUNNING
                ? "tool-running-dot bg-amber-500"
                : part.status === TOOL_CALL_STATUS.DONE
                  ? "bg-emerald-500"
                  : part.status === TOOL_CALL_STATUS.ERROR
                    ? "bg-rose-500"
                    : part.status === TOOL_CALL_STATUS.INTERRUPTED
                      ? "bg-stone-400"
                      : "bg-sky-500"
            }`}
          />

          <div className="min-w-0 flex flex-1 items-center gap-2 overflow-hidden">
            <div className="shrink-0 text-[13px] font-semibold text-stone-950">
              {presentation.toolLabel}
            </div>
            <div
              className="min-w-0 flex-1 truncate text-xs text-stone-400"
              title={presentation.actionLabel}
            >
              {presentation.actionLabel}
            </div>
          </div>
        </div>

        <div
          className={`shrink-0 rounded-xl px-3 py-1 text-[10px] font-medium uppercase tracking-[0.16em] ${getStatusClasses(
            part.status,
          )}`}
        >
          {getStatusLabel(part.status)}
        </div>
      </div>

      {hasDetails ? (
        <div className="mt-2">
          <div className="flex items-center justify-between gap-3">
            <button
              className="flex max-w-full min-w-0 cursor-pointer list-none flex-wrap items-center gap-2 rounded-full px-3 py-1.5 text-left text-[11px] font-medium text-stone-500 transition-colors hover:bg-stone-100"
              onClick={() => {
                setIsDetailsOpen((value) => !value);
              }}
              type="button"
            >
              <span>Details</span>
              {presentation.meta.length > 0 ? (
                <span className="chat-text-wrap text-stone-400">
                  {presentation.meta.join(" / ")}
                </span>
              ) : null}
            </button>

            {detailsAccessory ? <div className="shrink-0">{detailsAccessory}</div> : null}
          </div>

          {isDetailsOpen ? (
            <div className="mt-2 space-y-3 rounded-[18px] bg-stone-100/70 p-3">
              {hasUpdates ? (
                <div className="rounded-[14px] bg-white/75 px-3 py-3">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-stone-400">
                    Recent updates
                  </div>
                  <div className="mt-2 space-y-2 text-sm leading-6 text-stone-700">
                    {part.updates.map((update, index) => (
                      <div
                        className="chat-text-wrap rounded-xl bg-stone-100 px-3 py-2"
                        key={`${part.toolCallId ?? "tool"}-update-${index}`}
                      >
                        {update}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {hasRawInput ? (
                <div className="rounded-[14px] bg-white/75 px-3 py-3">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-stone-400">
                    Input
                  </div>
                  <pre className="chat-text-wrap mt-2 max-h-56 overflow-auto text-xs leading-6 whitespace-pre-wrap text-stone-700">
                    {formatJson(part.input)}
                  </pre>
                </div>
              ) : null}

              {hasRawOutput ? (
                <div className="rounded-[14px] bg-white/75 px-3 py-3">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-stone-400">
                    Output
                  </div>
                  <pre className="chat-text-wrap mt-2 max-h-72 overflow-auto text-xs leading-6 whitespace-pre-wrap text-stone-700">
                    {part.output ?? part.error}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : detailsAccessory ? (
        <div className="mt-2 flex justify-end">{detailsAccessory}</div>
      ) : null}
    </section>
  );
}
