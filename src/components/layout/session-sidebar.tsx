"use client";

import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { useSessionContext } from "@/components/providers/session-provider";
import { SESSION_STATUS } from "@/lib/constants";
import type { SessionDetailDto } from "@/lib/session-dto";

interface SessionSidebarProps {
  currentSession: SessionDetailDto;
  isDesktopOpen: boolean;
  onDesktopOpenChange: (open: boolean) => void;
  isMobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

export function SessionSidebar({
  currentSession,
  isDesktopOpen,
  onDesktopOpenChange,
  isMobileOpen,
  onMobileOpenChange,
}: SessionSidebarProps) {
  const router = useRouter();
  const { sessions, isLoadingSessions, createSession, removeSession } =
    useSessionContext();
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setError(null);
    setPendingSessionId("create");
    try {
      const session = await createSession();
      onDesktopOpenChange(true);
      onMobileOpenChange(false);
      router.push(`/chat/${session.id}`);
    } catch (nextError: unknown) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Failed to create chat",
      );
    } finally {
      setPendingSessionId(null);
    }
  };

  const handleDelete = async (sessionId: string) => {
    setError(null);
    setPendingSessionId(sessionId);

    const remainingSessions = sessions.filter(
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
        nextError instanceof Error
          ? nextError.message
          : "Failed to delete chat",
      );
    } finally {
      setPendingSessionId(null);
    }
  };

  const handleHide = () => {
    if (isMobileOpen) {
      onMobileOpenChange(false);
      return;
    }

    onDesktopOpenChange(false);
  };

  return (
    <>
      {!isDesktopOpen ? (
        <button
          aria-expanded={false}
          aria-label="Open chats"
          className="fixed left-4 top-4 z-40 hidden h-11 w-11 cursor-pointer items-center justify-center rounded-[18px] bg-white/88 text-stone-700 shadow-[0_16px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl transition hover:bg-white lg:inline-flex"
          onClick={() => onDesktopOpenChange(true)}
          type="button"
        >
          <PanelLeftOpen aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
        </button>
      ) : null}

      {!isMobileOpen ? (
        <button
          aria-expanded={false}
          aria-label="Open chats"
          className="fixed left-4 top-4 z-40 inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-[18px] bg-white/88 text-stone-700 shadow-[0_16px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl transition hover:bg-white lg:hidden"
          onClick={() => onMobileOpenChange(true)}
          type="button"
        >
          <PanelLeftOpen aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
        </button>
      ) : null}

      <div
        className={`fixed inset-0 z-30 bg-zinc-800/18 backdrop-blur-[2px] transition lg:hidden ${
          isMobileOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        onClick={() => onMobileOpenChange(false)}
      />

      <aside
        className={`fixed inset-y-4 left-4 z-40 w-[calc(100vw-2rem)] max-w-76 flex-col overflow-hidden rounded-[30px] bg-[rgba(255,252,247,0.84)] shadow-[0_28px_90px_rgba(15,23,42,0.16)] backdrop-blur-xl ${
          isMobileOpen ? "flex" : "hidden"
        } ${isDesktopOpen ? "lg:flex" : "lg:hidden"}`}
      >
        <div className="bg-white/38 px-4 pb-3 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold tracking-tight text-stone-950">
                Chats
              </div>
              <div className="text-xs text-stone-500">Session history</div>
            </div>

            <button
              aria-label="Collapse chats"
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[14px] bg-white/80 text-stone-600 transition hover:bg-white"
              onClick={handleHide}
              type="button"
            >
              <PanelLeftClose aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </div>

          <button
            className="mt-4 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-[18px] bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-200 disabled:text-emerald-50"
            disabled={pendingSessionId === "create"}
            onClick={() => {
              void handleCreate();
            }}
            type="button"
          >
            <Plus aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
            <span>
              {pendingSessionId === "create" ? "Creating..." : "New chat"}
            </span>
          </button>
        </div>

        {error ? (
          <div className="px-4 pt-3 text-xs text-rose-600">{error}</div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <div className="space-y-1.5">
            {isLoadingSessions && sessions.length === 0 ? (
              <div className="rounded-[14px] bg-white/55 px-3 py-3 text-sm text-stone-500">
                Loading chats...
              </div>
            ) : null}

            {sessions.map((session) => {
              const isActive = session.id === currentSession.id;
              const isBusy = session.status === SESSION_STATUS.BUSY;
              const isPending = pendingSessionId === session.id;

              return (
                <div
                  className={`group flex cursor-pointer items-center gap-1.5 rounded-2xl px-1.5 py-1 transition ${
                    isActive
                      ? "bg-zinc-800 text-white shadow-[0_12px_28px_rgba(24,24,27,0.18)]"
                      : "bg-transparent text-stone-700 hover:bg-white/72"
                  }`}
                  key={session.id}
                >
                  <button
                    className="min-w-0 flex-1 cursor-pointer rounded-xl px-3 py-2.5 text-left"
                    onClick={() => {
                      onMobileOpenChange(false);
                      router.push(`/chat/${session.id}`);
                    }}
                    type="button"
                  >
                    <div
                      className={`truncate text-sm font-medium ${
                        isActive ? "text-white" : "text-stone-800"
                      }`}
                    >
                      {session.title}
                    </div>
                  </button>

                  <button
                    aria-label={`Delete ${session.title}`}
                    className={`inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-[10px] transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      isActive
                        ? "text-white/70 hover:bg-rose-300/18 hover:text-rose-100"
                        : "bg-transparent text-stone-400 opacity-100 hover:bg-rose-50 hover:text-rose-600 sm:opacity-0 sm:group-hover:opacity-100"
                    }`}
                    disabled={isBusy || isPending}
                    onClick={() => {
                      void handleDelete(session.id);
                    }}
                    type="button"
                  >
                    {isPending ? (
                      "..."
                    ) : (
                      <Trash2 aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    </>
  );
}
