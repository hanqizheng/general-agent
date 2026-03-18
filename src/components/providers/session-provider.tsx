"use client";

import { createContext, useContext, useMemo, useState } from "react";

import type { SessionDetailDto } from "@/lib/session-dto";

interface SessionContextValue {
  session: SessionDetailDto;
  setSession: React.Dispatch<React.SetStateAction<SessionDetailDto>>;
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
  const value = useMemo(() => ({ session, setSession }), [session]);

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
