"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useSessions } from "@/hooks/use-sessions";
import type { SessionDetailDto, SessionSummaryDto } from "@/lib/session-dto";

type SessionPatch = {
  id: string;
} & Partial<Omit<SessionDetailDto, "id">>;

interface SessionContextValue {
  session: SessionDetailDto;
  sessions: SessionSummaryDto[];
  isLoadingSessions: boolean;
  replaceSession: (nextSession: SessionDetailDto) => void;
  patchSession: (patch: SessionPatch) => void;
  createSession: () => Promise<SessionDetailDto>;
  removeSession: (sessionId: string) => Promise<SessionDetailDto>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function toSessionSummary(
  session: SessionDetailDto | SessionSummaryDto,
): SessionSummaryDto {
  return {
    id: session.id,
    title: session.title,
    status: session.status,
    createdAt: session.createdAt,
    lastMessageAt: session.lastMessageAt,
  };
}

function applyPatchToSummary(
  summary: SessionSummaryDto,
  patch: SessionPatch,
): SessionSummaryDto {
  return {
    id: summary.id,
    title: patch.title ?? summary.title,
    status: patch.status ?? summary.status,
    createdAt: patch.createdAt ?? summary.createdAt,
    lastMessageAt:
      patch.lastMessageAt !== undefined
        ? patch.lastMessageAt
        : summary.lastMessageAt,
  };
}

function areSessionSummariesEqual(
  left: SessionSummaryDto,
  right: SessionSummaryDto,
) {
  return (
    left.id === right.id &&
    left.title === right.title &&
    left.status === right.status &&
    left.createdAt === right.createdAt &&
    left.lastMessageAt === right.lastMessageAt
  );
}

export function SessionProvider({
  children,
  initialSession,
}: {
  children: React.ReactNode;
  initialSession: SessionDetailDto;
}) {
  const [session, setSession] = useState(initialSession);
  const { sessions, isLoading, create, remove, setSessions } = useSessions();

  const replaceSession = useCallback(
    (nextSession: SessionDetailDto) => {
      setSession(nextSession);
      setSessions((current) => {
        const summary = toSessionSummary(nextSession);
        const existing = current.find((item) => item.id === nextSession.id);

        if (!existing) {
          return [summary, ...current];
        }

        return current.map((item) =>
          item.id === nextSession.id ? summary : item,
        );
      });
    },
    [setSessions],
  );

  const patchSession = useCallback(
    (patch: SessionPatch) => {
      let nextCurrentSession: SessionDetailDto | null = null;

      setSession((current) => {
        if (current.id !== patch.id) {
          return current;
        }

        nextCurrentSession = {
          ...current,
          ...patch,
        };
        return nextCurrentSession;
      });

      setSessions((current) => {
        const existing = current.find((item) => item.id === patch.id);

        if (existing) {
          return current.map((item) =>
            item.id === patch.id ? applyPatchToSummary(item, patch) : item,
          );
        }

        if (nextCurrentSession) {
          return [toSessionSummary(nextCurrentSession), ...current];
        }

        return current;
      });
    },
    [setSessions],
  );

  useEffect(() => {
    setSessions((current) => {
      const summary = toSessionSummary(session);
      const existing = current.find((item) => item.id === session.id);

      if (!existing) {
        return [summary, ...current];
      }

      if (areSessionSummariesEqual(existing, summary)) {
        return current;
      }

      return current.map((item) => (item.id === session.id ? summary : item));
    });
  }, [session, sessions, setSessions]);

  const value = useMemo(
    () => ({
      session,
      sessions,
      isLoadingSessions: isLoading,
      replaceSession,
      patchSession,
      createSession: create,
      removeSession: remove,
    }),
    [create, isLoading, patchSession, remove, replaceSession, session, sessions],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSessionContext() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSessionContext must be used within SessionProvider");
  }

  return context;
}
