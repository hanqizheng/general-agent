import type { LoopEndReason, SessionStatus } from "@/lib/chat-types";
import { SESSION_STATUS } from "@/lib/constants";

interface HeaderProps {
  currentTurnIndex: number;
  loopEndReason: LoopEndReason | null;
  messageCount: number;
  sessionId: string | null;
  status: SessionStatus;
}

function getStatusClasses(status: SessionStatus) {
  switch (status) {
    case SESSION_STATUS.BUSY:
      return "border-amber-300/60 bg-amber-50 text-amber-800";
    case SESSION_STATUS.ERROR:
      return "border-rose-300/60 bg-rose-50 text-rose-800";
    case SESSION_STATUS.IDLE:
    default:
      return "border-emerald-300/60 bg-emerald-50 text-emerald-800";
  }
}

export function Header({
  currentTurnIndex,
  loopEndReason,
  messageCount,
  sessionId,
  status,
}: HeaderProps) {
  return (
    <header className="border-b border-stone-900/8 px-4 py-4 lg:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex rounded-full border border-stone-900/10 bg-stone-900/5 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-stone-600">
            Runtime Console
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-stone-950">
              Session-backed runtime console
            </h1>
            <p className="mt-1 text-sm leading-6 text-stone-600">
              Hydrated transcript history and live streaming share the same
              session state now, so refresh and recovery no longer reset the
              conversation.
            </p>
          </div>
        </div>

        <div className="grid gap-2 text-sm text-stone-700 sm:grid-cols-3 lg:min-w-105">
          <div className="rounded-2xl border border-stone-900/8 bg-white/80 px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.18em] text-stone-500">
              Session
            </div>
            <div className="mt-1 font-mono text-xs text-stone-800">
              {sessionId ?? "loading"}
            </div>
          </div>

          <div className="rounded-2xl border border-stone-900/8 bg-white/80 px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.18em] text-stone-500">
              Turn / Messages
            </div>
            <div className="mt-1 font-medium text-stone-900">
              {currentTurnIndex} / {messageCount}
            </div>
          </div>

          <div className="rounded-2xl border border-stone-900/8 bg-white/80 px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.18em] text-stone-500">
              Status
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] ${getStatusClasses(
                  status,
                )}`}
              >
                {status}
              </span>
              {loopEndReason ? (
                <span className="text-xs text-stone-500">
                  loop: {loopEndReason}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
