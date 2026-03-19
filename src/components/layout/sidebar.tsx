import type { LoopEndReason, SessionStatus } from "@/lib/chat-types";
import { SESSION_STATUS } from "@/lib/constants";

interface SidebarProps {
  currentTurnIndex: number;
  loopEndReason: LoopEndReason | null;
  messageCount: number;
  partCount: number;
  status: SessionStatus;
  toolCount: number;
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

export function Sidebar({
  currentTurnIndex,
  loopEndReason,
  messageCount,
  partCount,
  status,
  toolCount,
}: SidebarProps) {
  return (
    <aside className="flex flex-col overflow-hidden rounded-[32px] border border-stone-900/10 bg-[linear-gradient(180deg,_rgba(255,253,248,0.94),_rgba(246,240,230,0.92))] p-6 shadow-[0_20px_60px_rgba(48,36,22,0.09)]">
      <div className="space-y-4">
        <div className="inline-flex rounded-full border border-stone-900/10 bg-stone-900/5 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-stone-600">
          General Agent
        </div>

        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-stone-950">
            Session observer
          </h2>
          <p className="mt-2 text-sm leading-7 text-stone-600">
            This view now hydrates from persisted transcript state first, then
            layers live agent events on top. Session, message, and part order
            all come from the same DB-backed model.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "messages", value: String(messageCount) },
            { label: "parts", value: String(partCount) },
            { label: "tools", value: String(toolCount) },
            { label: "turn", value: String(currentTurnIndex) },
          ].map((item) => (
            <div
              className="rounded-[22px] border border-stone-900/8 bg-white/80 px-4 py-3"
              key={item.label}
            >
              <div className="text-[11px] uppercase tracking-[0.18em] text-stone-500">
                {item.label}
              </div>
              <div className="mt-1 text-2xl font-semibold tracking-tight text-stone-950">
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-[24px] border border-stone-900/8 bg-stone-950 px-4 py-4 text-stone-100">
        <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400">
          State Model
        </div>
        <pre className="mt-3 overflow-auto font-mono text-xs leading-6 text-stone-200">
          {`Session
└─ Message[]
   └─ Part[]
      ├─ reasoning
      ├─ text
      └─ tool`}
        </pre>
      </div>

      <div className="mt-6 space-y-3 rounded-[24px] border border-stone-900/8 bg-white/80 px-4 py-4">
        <div className="text-[11px] uppercase tracking-[0.2em] text-stone-500">
          Runtime Notes
        </div>
        <div className="text-sm leading-7 text-stone-600">
          One session can run only one active agent loop at a time. Refreshing
          the page rehydrates from persisted messages instead of resetting the
          conversation.
        </div>
      </div>

      <div className="mt-auto pt-6">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.18em] ${getStatusClasses(
              status,
            )}`}
          >
            {status}
          </span>
          {loopEndReason ? (
            <span className="text-xs text-stone-500">
              last loop: {loopEndReason}
            </span>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
