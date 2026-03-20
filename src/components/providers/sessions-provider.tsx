"use client";

import { createContext, useCallback, useContext, useMemo } from "react";

import { useSessions } from "@/hooks/use-sessions";
import {
  applyPatchToSummary,
  areSessionSummariesEqual,
  type SessionPatch,
  toSessionSummary,
} from "@/lib/session-summary";
import type { SessionDetailDto, SessionSummaryDto } from "@/lib/session-dto";

interface SessionsContextValue {
  sessions: SessionSummaryDto[];
  isLoadingSessions: boolean;
  replaceSessionSummary: (
    nextSession: SessionDetailDto | SessionSummaryDto,
  ) => void;
  patchSessionSummary: (patch: SessionPatch) => void;
  createSession: () => Promise<SessionDetailDto>;
  removeSession: (sessionId: string) => Promise<SessionDetailDto>;
}

const SessionsContext = createContext<SessionsContextValue | null>(null);

export function SessionsProvider({
  children,
  initialSessions,
}: {
  children: React.ReactNode;
  initialSessions: SessionSummaryDto[];
}) {
  const { sessions, isLoading, create, remove, setSessions } =
    useSessions(initialSessions);

  const replaceSessionSummary = useCallback(
    (nextSession: SessionDetailDto | SessionSummaryDto) => {
      setSessions((current) => {
        const summary = toSessionSummary(nextSession);
        const existing = current.find((item) => item.id === nextSession.id);

        if (!existing) {
          return [summary, ...current];
        }

        if (areSessionSummariesEqual(existing, summary)) {
          return current;
        }

        return current.map((item) =>
          item.id === nextSession.id ? summary : item,
        );
      });
    },
    [setSessions],
  );

  const patchSessionSummary = useCallback(
    (patch: SessionPatch) => {
      setSessions((current) => {
        const existing = current.find((item) => item.id === patch.id);

        if (!existing) {
          return current;
        }

        const nextSummary = applyPatchToSummary(existing, patch);
        if (areSessionSummariesEqual(existing, nextSummary)) {
          return current;
        }

        return current.map((item) =>
          item.id === patch.id ? nextSummary : item,
        );
      });
    },
    [setSessions],
  );

  const value = useMemo(
    () => ({
      sessions,
      isLoadingSessions: isLoading,
      replaceSessionSummary,
      patchSessionSummary,
      createSession: create,
      removeSession: remove,
    }),
    [
      create,
      isLoading,
      patchSessionSummary,
      remove,
      replaceSessionSummary,
      sessions,
    ],
  );

  return (
    <SessionsContext.Provider value={value}>{children}</SessionsContext.Provider>
  );
}

export function useSessionsContext() {
  const context = useContext(SessionsContext);
  if (!context) {
    throw new Error("useSessionsContext must be used within SessionsProvider");
  }

  return context;
}
