import type { UIReasoningPart } from "@/lib/chat-types";
import { MESSAGE_PART_END_STATE } from "@/lib/constants";

interface ReasoningRendererProps {
  part: UIReasoningPart;
}

export function ReasoningRenderer({ part }: ReasoningRendererProps) {
  const summaryLabel =
    part.state === null
      ? "Analyzing next step"
      : part.state === MESSAGE_PART_END_STATE.ERROR
        ? "Analysis failed"
        : part.state === MESSAGE_PART_END_STATE.INTERRUPTED
          ? "Analysis stopped"
          : "Analysis complete";

  return (
    <div className="rounded-[22px] bg-amber-100/80 px-4 py-3 text-amber-950 shadow-[0_12px_30px_rgba(217,119,6,0.08)]">
      <div className="flex items-center gap-3">
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            part.state === null ? "tool-running-dot bg-amber-500" : "bg-amber-700/60"
          }`}
        />
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.2em] text-amber-800/80">
            Analysis
          </div>
          <div
            className={`mt-1 text-sm font-medium ${
              part.state === null ? "tool-running-text" : "text-amber-950"
            }`}
          >
            {summaryLabel}
          </div>
        </div>
      </div>
    </div>
  );
}
