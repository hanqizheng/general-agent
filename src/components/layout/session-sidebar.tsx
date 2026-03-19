"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useSessionContext } from "@/components/providers/session-provider";
import type { SessionStatus } from "@/lib/chat-types";
import { SESSION_STATUS } from "@/lib/constants";
import type { SessionDetailDto } from "@/lib/session-dto";

interface SessionSidebarProps {
  currentSession: SessionDetailDto;
  isMobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

function formatSecondaryText(session: {
  lastMessageAt: string | null;
  status: SessionStatus;
}) {
  if (!session.lastMessageAt) {
    if (session.status === SESSION_STATUS.BUSY) {
      return "Running";
    }

    if (session.status === SESSION_STATUS.ERROR) {
      return "Error";
    }

    return "Empty chat";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(session.lastMessageAt));
}

export function SessionSidebar({
  currentSession,
  isMobileOpen,
  onMobileOpenChange,
}: SessionSidebarProps) {
  const router = useRouter();
  const { sessions, isLoadingSessions, createSession, removeSession } =
    useSessionContext();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const orderedSessions = useMemo(() => {
    const current = sessions.find((session) => session.id === currentSession.id);
    if (current) {
      return [current, ...sessions.filter((session) => session.id !== current.id)];
    }

    return sessions;
  }, [currentSession.id, sessions]);

  const handleCreate = async () => {
    setError(null);
    setPendingSessionId("create");
    try {
      const session = await createSession();
      onMobileOpenChange(false);
      router.push(`/chat/${session.id}`);
    } catch (nextError: unknown) {
      setError(
        nextError instanceof Error ? nextError.message : "Failed to create chat",
      );
    } finally {
      setPendingSessionId(null);
    }
  };

  const handleDelete = async (sessionId: string) => {
    setError(null);
    setPendingSessionId(sessionId);

    const remainingSessions = orderedSessions.filter(
      (session) => session.id !== sessionId,
    );

    try {
      await removeSession(sessionId);

      if (currentSession.id === sessionId) {
        const nextSession = remainingSessions[0] ?? (await createSession());
        router.push(`/chat/${nextSession.id}`);
      }
    } catch (nextError: unknown) {
      setError(
        nextError instanceof Error ? nextError.message : "Failed to delete chat",
      );
    } finally {
      setPendingSessionId(null);
    }
  };

  const containerWidth = isCollapsed ? "lg:w-[84px]" : "lg:w-[320px]";
  const mobileTransform = isMobileOpen ? "translate-x-0" : "-translate-x-full";

  return (
    <>
      <div
        className={`fixed inset-0 z-20 bg-stone-950/20 transition lg:hidden ${
          isMobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => onMobileOpenChange(false)}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-[280px] flex-col border-r border-stone-200 bg-stone-50 transition-transform lg:static lg:translate-x-0 ${containerWidth} ${mobileTransform}`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-4 py-4">
          {!isCollapsed ? (
            <div>
              <div className="text-sm font-semibold text-stone-900">Chats</div>
              <div className="text-xs text-stone-500">Session history</div>
            </div>
          ) : (
            <div className="text-sm font-semibold text-stone-900">AI</div>
          )}

          <button
            className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:bg-stone-100"
            onClick={() => setIsCollapsed((current) => !current)}
            type="button"
          >
            {isCollapsed ? "Open" : "Collapse"}
          </button>
        </div>

        <div className="border-b border-stone-200 px-4 py-4">
          <button
            className="inline-flex w-full items-center justify-center rounded-full bg-stone-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
            disabled={pendingSessionId === "create"}
            onClick={() => {
              void handleCreate();
            }}
            type="button"
          >
            {pendingSessionId === "create" ? "Creating..." : isCollapsed ? "+" : "New chat"}
          </button>
        </div>

        {error ? (
          <div className="px-4 pt-4 text-xs text-rose-600">{error}</div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <div className="space-y-2">
            {isLoadingSessions && orderedSessions.length === 0 ? (
              <div className="px-2 py-3 text-sm text-stone-500">Loading chats...</div>
            ) : null}

            {orderedSessions.map((session) => {
              const isActive = session.id === currentSession.id;
              const isBusy = session.status === SESSION_STATUS.BUSY;
              const isPending = pendingSessionId === session.id;

              return (
                <div
                  className={`group flex items-start gap-2 rounded-2xl border px-2 py-2 transition ${
                    isActive
                      ? "border-stone-300 bg-white shadow-[0_6px_20px_rgba(24,24,27,0.05)]"
                      : "border-transparent hover:border-stone-200 hover:bg-white/80"
                  }`}
                  key={session.id}
                >
                  <button
                    className="min-w-0 flex-1 rounded-xl px-2 py-2 text-left"
                    onClick={() => {
                      onMobileOpenChange(false);
                      router.push(`/chat/${session.id}`);
                    }}
                    type="button"
                  >
                    {isCollapsed ? (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-900 text-xs font-medium text-white">
                        {session.title.slice(0, 1).toUpperCase()}
                      </div>
                    ) : (
                      <>
                        <div className="truncate text-sm font-medium text-stone-900">
                          {session.title}
                        </div>
                        <div className="mt-1 truncate text-xs text-stone-500">
                          {formatSecondaryText(session)}
                        </div>
                      </>
                    )}
                  </button>

                  {!isCollapsed ? (
                    <button
                      className="rounded-full px-2 py-1 text-xs text-stone-400 opacity-0 transition hover:bg-stone-100 hover:text-stone-700 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isBusy || isPending}
                      onClick={() => {
                        void handleDelete(session.id);
                      }}
                      type="button"
                    >
                      {isPending ? "..." : "Delete"}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    </>
  );
}
