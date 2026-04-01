"use client";

import {
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { parseJsonResponse } from "@/lib/client-auth";
import type { SessionDetailDto, SessionSummaryDto } from "@/lib/session-dto";
import { isSessionSummaryVisible } from "@/lib/session-summary";

function filterVisibleSessions(sessions: SessionSummaryDto[]) {
  return sessions.filter(isSessionSummaryVisible);
}

export function useSessions(initialSessions: SessionSummaryDto[] = []) {
  const [sessions, setSessions] = useState<SessionSummaryDto[]>(
    filterVisibleSessions(initialSessions),
  );
  const [isLoading, setIsLoading] = useState(initialSessions.length === 0);
  const versionRef = useRef(0);

  const updateSessions = useCallback(
    (nextState: SetStateAction<SessionSummaryDto[]>) => {
      setSessions((current) => {
        const resolvedState =
          typeof nextState === "function"
            ? nextState(current)
            : nextState;

        if (resolvedState !== current) {
          versionRef.current += 1;
        }

        return resolvedState;
      });
    },
    [],
  );

  const refresh = useCallback(async () => {
    const requestVersion = versionRef.current;
    const response = await fetch("/api/sessions", {
      cache: "no-store",
    });

    const payload = await parseJsonResponse<{ sessions: SessionSummaryDto[] }>(
      response,
    );

    if (versionRef.current === requestVersion) {
      updateSessions(filterVisibleSessions(payload.sessions));
    }

    setIsLoading(false);
    return payload.sessions;
  }, [updateSessions]);

  useEffect(() => {
    let cancelled = false;
    const requestVersion = versionRef.current;

    const load = async () => {
      try {
        const response = await fetch("/api/sessions", {
          cache: "no-store",
        });

        const payload = await parseJsonResponse<{ sessions: SessionSummaryDto[] }>(
          response,
        );

        if (!cancelled && versionRef.current === requestVersion) {
          updateSessions(filterVisibleSessions(payload.sessions));
          setIsLoading(false);
          return;
        }

        if (!cancelled) {
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [updateSessions]);

  const create = useCallback(async () => {
    const response = await fetch("/api/sessions", {
      method: "POST",
    });

    const payload = await parseJsonResponse<{ session: SessionDetailDto }>(
      response,
    );
    updateSessions((current) =>
      isSessionSummaryVisible(payload.session)
        ? [payload.session, ...current]
        : current,
    );
    return payload.session;
  }, [updateSessions]);

  const remove = useCallback(async (sessionId: string) => {
    const response = await fetch(`/api/sessions/${sessionId}`, {
      method: "DELETE",
    });

    const payload = await parseJsonResponse<{ session: SessionDetailDto }>(
      response,
    );
    updateSessions((current) =>
      current.filter((session) => session.id !== payload.session.id),
    );
    return payload.session;
  }, [updateSessions]);

  return {
    sessions,
    isLoading,
    refresh,
    create,
    remove,
    setSessions: updateSessions,
  };
}
