import type { UIToolPart } from "@/lib/chat-types";
import { TOOL_CALL_STATUS } from "@/lib/constants";
import { getToolPresentation } from "./tool-presentation";

interface ToolRendererProps {
  part: UIToolPart;
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

export function ToolRenderer({ part }: ToolRendererProps) {
  const presentation = getToolPresentation(part);
  const hasRawInput = part.input !== null;
  const hasRawOutput = Boolean(part.output || part.error);
  const hasUpdates = part.updates.length > 0;

  return (
    <section className="overflow-hidden rounded-[26px] bg-[rgba(255,252,247,0.92)] px-4 py-4 text-stone-900 shadow-[0_16px_40px_rgba(24,24,27,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
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
            <div className="truncate text-[11px] uppercase tracking-[0.2em] text-stone-500">
              {presentation.toolLabel}
            </div>
          </div>

          <div
            className={`mt-2 text-sm font-medium ${
              part.status === TOOL_CALL_STATUS.RUNNING ? "tool-running-text" : "text-stone-900"
            }`}
          >
            {presentation.actionLabel}
          </div>

          <div className="mt-1 text-xs leading-6 text-stone-500">
            {presentation.summaryLabel}
          </div>
        </div>

        <div
          className={`rounded-[12px] px-3 py-1 text-[10px] uppercase tracking-[0.18em] ${getStatusClasses(
            part.status,
          )}`}
        >
          {getStatusLabel(part.status)}
        </div>
      </div>

      {presentation.meta.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {presentation.meta.map((item) => (
            <span
              className="rounded-[12px] bg-stone-100 px-2.5 py-1 text-[11px] text-stone-500"
              key={item}
            >
              {item}
            </span>
          ))}
        </div>
      ) : null}

      {hasRawInput || hasRawOutput || hasUpdates ? (
        <details className="mt-3 overflow-hidden rounded-[20px] bg-stone-100/85">
          <summary className="cursor-pointer list-none px-3 py-3 text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
            View details
          </summary>

          <div className="space-y-3 px-3 pb-3">
            {hasUpdates ? (
              <div className="rounded-[18px] bg-white/70 px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-stone-500">
                  Recent updates
                </div>
                <div className="mt-2 space-y-2 text-sm leading-6 text-stone-700">
                  {part.updates.map((update, index) => (
                    <div
                      className="rounded-[14px] bg-stone-100 px-3 py-2"
                      key={`${part.toolCallId ?? "tool"}-update-${index}`}
                    >
                      {update}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {hasRawInput ? (
              <div className="rounded-[18px] bg-white/70 px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-stone-500">
                  Input
                </div>
                <pre className="mt-2 max-h-56 overflow-auto text-xs leading-6 whitespace-pre-wrap text-stone-700">
                  {formatJson(part.input)}
                </pre>
              </div>
            ) : null}

            {hasRawOutput ? (
              <div className="rounded-[18px] bg-white/70 px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-stone-500">
                  Output
                </div>
                <pre className="mt-2 max-h-72 overflow-auto text-xs leading-6 whitespace-pre-wrap text-stone-700">
                  {part.output ?? part.error}
                </pre>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </section>
  );
}
