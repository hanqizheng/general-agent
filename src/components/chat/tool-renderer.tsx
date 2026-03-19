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
  const hasDetails = hasRawInput || hasRawOutput || hasUpdates;

  return (
    <section className="min-w-0 overflow-hidden rounded-3xl px-3 py-3 text-stone-900 sm:px-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex flex-1 items-start gap-3 sm:items-center">
          <span
            className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full sm:mt-0 ${
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

          <div className="min-w-0 flex flex-1 flex-col gap-1 overflow-hidden sm:flex-row sm:items-center sm:gap-2">
            <div className="shrink-0 text-[13px] font-semibold text-stone-950">
              {presentation.toolLabel}
            </div>
            <div
              className="chat-text-wrap min-w-0 flex-1 text-xs text-stone-400 sm:truncate"
              title={presentation.actionLabel}
            >
              {presentation.actionLabel}
            </div>
          </div>
        </div>

        <div
          className={`shrink-0 self-start rounded-xl px-3 py-1 text-[10px] font-medium uppercase tracking-[0.16em] sm:self-auto ${getStatusClasses(
            part.status,
          )}`}
        >
          {getStatusLabel(part.status)}
        </div>
      </div>

      {hasDetails ? (
        <details className="group mt-2">
          <summary className="flex max-w-full cursor-pointer list-none flex-wrap items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-medium text-stone-500 transition-colors hover:bg-stone-100 [&::-webkit-details-marker]:hidden">
            <span>Details</span>
            {presentation.meta.length > 0 ? (
              <span className="chat-text-wrap text-stone-400">
                {presentation.meta.join(" / ")}
              </span>
            ) : null}
          </summary>

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
        </details>
      ) : null}
    </section>
  );
}
