import type { UIToolPart } from "@/lib/chat-types";
import {
  MESSAGE_PART_END_STATE,
  TOOL_CALL_STATUS,
} from "@/lib/constants";

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
      return "border-sky-300/50 bg-sky-50 text-sky-800";
    case TOOL_CALL_STATUS.RUNNING:
      return "border-amber-300/50 bg-amber-50 text-amber-800";
    case TOOL_CALL_STATUS.DONE:
      return "border-emerald-300/50 bg-emerald-50 text-emerald-800";
    case TOOL_CALL_STATUS.INTERRUPTED:
      return "border-stone-300/50 bg-stone-100 text-stone-700";
    case TOOL_CALL_STATUS.ERROR:
      return "border-rose-300/50 bg-rose-50 text-rose-800";
    default:
      return "border-stone-300/50 bg-stone-50 text-stone-700";
  }
}

function getStatusLabel(status: UIToolPart["status"]) {
  switch (status) {
    case TOOL_CALL_STATUS.PENDING:
      return "pending";
    case TOOL_CALL_STATUS.RUNNING:
      return "running";
    case TOOL_CALL_STATUS.DONE:
      return "done";
    case TOOL_CALL_STATUS.INTERRUPTED:
      return "stopped";
    case TOOL_CALL_STATUS.ERROR:
      return "error";
    default:
      return "unknown";
  }
}

export function ToolRenderer({ part }: ToolRendererProps) {
  const shouldOpenOutput =
    part.status !== TOOL_CALL_STATUS.DONE ||
    part.state === MESSAGE_PART_END_STATE.ERROR ||
    part.state === MESSAGE_PART_END_STATE.INTERRUPTED;

  return (
    <section className="overflow-hidden rounded-[24px] border border-stone-900/10 bg-stone-950 text-stone-50 shadow-[0_18px_40px_rgba(23,18,12,0.18)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-4 py-4">
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400">
            Tool Call
          </div>
          <div className="text-base font-medium text-white">
            {part.toolName ?? "Pending tool"}
          </div>
          {part.toolCallId ? (
            <div className="font-mono text-[11px] text-stone-400">
              {part.toolCallId}
            </div>
          ) : null}
        </div>

        <div
          className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.18em] ${getStatusClasses(
            part.status,
          )}`}
        >
          {getStatusLabel(part.status)}
        </div>
      </div>

      <div className="space-y-3 px-4 py-4">
        <details className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          <summary className="cursor-pointer list-none px-3 py-2 text-xs uppercase tracking-[0.18em] text-stone-300">
            Input
          </summary>
          <pre className="max-h-56 overflow-auto border-t border-white/8 px-3 py-3 text-xs leading-6 whitespace-pre-wrap text-stone-200">
            {formatJson(part.input)}
          </pre>
        </details>

        {part.updates.length > 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
            <div className="text-xs uppercase tracking-[0.18em] text-stone-300">
              Live Updates
            </div>
            <div className="mt-2 space-y-2 text-sm leading-6 text-stone-100">
              {part.updates.map((update, index) => (
                <div
                  className="rounded-xl border border-white/8 bg-black/10 px-3 py-2"
                  key={`${part.toolCallId ?? "tool"}-update-${index}`}
                >
                  {update}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {part.output || part.error ? (
          <details
            className="overflow-hidden rounded-2xl border border-white/10 bg-white/5"
            open={shouldOpenOutput ? true : undefined}
          >
            <summary className="cursor-pointer list-none px-3 py-2 text-xs uppercase tracking-[0.18em] text-stone-300">
              Output
            </summary>
            <pre className="max-h-72 overflow-auto border-t border-white/8 px-3 py-3 text-xs leading-6 whitespace-pre-wrap text-stone-100">
              {part.output ?? part.error}
            </pre>
          </details>
        ) : null}

        <div className="flex flex-wrap gap-4 text-xs text-stone-400">
          <div>part: {part.partIndex}</div>
          <div>state: {part.state ?? "open"}</div>
          <div>duration: {part.durationMs ? `${part.durationMs}ms` : "--"}</div>
        </div>
      </div>
    </section>
  );
}
