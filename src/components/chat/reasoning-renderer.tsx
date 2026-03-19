import type { UIReasoningPart } from "@/lib/chat-types";
import { MESSAGE_PART_END_STATE } from "@/lib/constants";

interface ReasoningRendererProps {
  part: UIReasoningPart;
}

export function ReasoningRenderer({ part }: ReasoningRendererProps) {
  const statusLabel =
    part.state === null
      ? "streaming"
      : part.state === MESSAGE_PART_END_STATE.ERROR
        ? "error"
        : part.state === MESSAGE_PART_END_STATE.INTERRUPTED
          ? "stopped"
        : "done";

  return (
    <details
      className="overflow-hidden rounded-[24px] border border-amber-700/14 bg-amber-50/70"
      open={part.state !== MESSAGE_PART_END_STATE.COMPLETE ? true : undefined}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm text-amber-950">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-amber-800/80">
            Reasoning
          </div>
          <div className="mt-1 font-medium">
            Internal chain-of-thought projection
          </div>
        </div>

        <span className="rounded-full border border-amber-800/14 bg-white/80 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-amber-800">
          {statusLabel}
        </span>
      </summary>

      <div className="border-t border-amber-700/10 px-4 py-4 text-sm leading-7 whitespace-pre-wrap text-amber-950/80">
        {part.text || "Thinking..."}
      </div>
    </details>
  );
}
