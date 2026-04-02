"use client";

import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  Clock3,
  LoaderCircle,
  PauseCircle,
} from "lucide-react";

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

function getStatusAppearance(status: UIToolPart["status"]) {
  switch (status) {
    case TOOL_CALL_STATUS.PENDING:
      return {
        badgeClassName: "bg-sky-500 text-white",
        icon: Clock3,
        iconClassName: "",
      };
    case TOOL_CALL_STATUS.RUNNING:
      return {
        badgeClassName: "bg-amber-500 text-white",
        icon: LoaderCircle,
        iconClassName: "animate-spin",
      };
    case TOOL_CALL_STATUS.DONE:
      return {
        badgeClassName: "bg-emerald-500 text-white",
        icon: Check,
        iconClassName: "",
      };
    case TOOL_CALL_STATUS.INTERRUPTED:
      return {
        badgeClassName: "bg-stone-400 text-white",
        icon: PauseCircle,
        iconClassName: "",
      };
    case TOOL_CALL_STATUS.ERROR:
      return {
        badgeClassName: "bg-rose-500 text-white",
        icon: AlertTriangle,
        iconClassName: "",
      };
    default:
      return {
        badgeClassName: "bg-stone-400 text-white",
        icon: Clock3,
        iconClassName: "",
      };
  }
}

export function ToolRenderer({ part, detailsAccessory }: ToolRendererProps) {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const presentation = getToolPresentation(part);
  const statusAppearance = getStatusAppearance(part.status);
  const StatusIcon = statusAppearance.icon;
  const hasRawInput = part.input !== null;
  const hasRawOutput = Boolean(part.output || part.error);
  const hasUpdates = part.updates.length > 0;
  const hasDetails = hasRawInput || hasRawOutput || hasUpdates;

  return (
    <section className="min-w-0 overflow-hidden rounded-3xl px-3 py-3 text-stone-900 sm:px-4">
      <div className="flex items-start gap-2">
        <div
          className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${statusAppearance.badgeClassName}`}
        >
          <StatusIcon
            className={`h-3 w-3 ${statusAppearance.iconClassName}`}
            strokeWidth={2.6}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-h-5 min-w-0 items-center gap-2">
            <div className="shrink-0 text-sm font-semibold text-stone-950">
              {presentation.toolLabel}
            </div>
            <div
              className="chat-text-wrap min-w-0 flex-1 truncate text-xs text-stone-400"
              title={presentation.actionLabel}
            >
              {presentation.actionLabel}
            </div>
            {hasDetails ? (
              <button
                className="shrink-0 cursor-pointer rounded-xl px-2.5 py-1 text-[11px] font-medium text-stone-500 transition-colors hover:bg-stone-100"
                onClick={() => {
                  setIsDetailsOpen((value) => !value);
                }}
                type="button"
              >
                Details
              </button>
            ) : null}
          </div>

          {presentation.meta.length > 0 ? (
            <div className="mt-1 text-[11px] text-stone-400">
              {presentation.meta.join(" / ")}
            </div>
          ) : null}
        </div>
      </div>

      {detailsAccessory ? (
        <div className="mt-2 flex justify-end">{detailsAccessory}</div>
      ) : null}

      {hasDetails && isDetailsOpen ? (
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
    </section>
  );
}
