"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useSessionsContext } from "@/components/providers/sessions-provider";
import type { SessionPatch } from "@/lib/session-summary";
import type { SessionDetailDto } from "@/lib/session-dto";

interface SessionContextValue {
  session: SessionDetailDto;
  replaceSession: (nextSession: SessionDetailDto) => void;
  patchSession: (patch: SessionPatch) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({
  children,
  initialSession,
}: {
  children: React.ReactNode;
  initialSession: SessionDetailDto;
}) {
  const [session, setSession] = useState(initialSession);
  const { patchSessionSummary, replaceSessionSummary } = useSessionsContext();

  const replaceSession = useCallback(
    (nextSession: SessionDetailDto) => {
      setSession(nextSession);
      replaceSessionSummary(nextSession);
    },
    [replaceSessionSummary],
  );

  const patchSession = useCallback(
    (patch: SessionPatch) => {
      setSession((current) => {
        if (current.id !== patch.id) {
          return current;
        }

        return {
          ...current,
          ...patch,
        };
      });
      patchSessionSummary(patch);
    },
    [patchSessionSummary],
  );

  useEffect(() => {
    replaceSessionSummary(session);
  }, [replaceSessionSummary, session]);

  const value = useMemo(
    () => ({
      session,
      replaceSession,
      patchSession,
    }),
    [patchSession, replaceSession, session],
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
