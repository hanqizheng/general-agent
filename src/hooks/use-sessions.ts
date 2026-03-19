"use client";

import { useCallback, useEffect, useState } from "react";

import type { SessionDetailDto, SessionSummaryDto } from "@/lib/session-dto";

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    let parsedMessage = "";
    try {
      const parsed = JSON.parse(errorText) as {
        error?: string;
        message?: string;
      };
      parsedMessage = parsed.message || parsed.error || "";
    } catch {
      parsedMessage = "";
    }
    throw new Error(parsedMessage || errorText || `Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export function useSessions() {
  const [sessions, setSessions] = useState<SessionSummaryDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/sessions", {
      cache: "no-store",
    });

    const payload = await parseJsonResponse<{ sessions: SessionSummaryDto[] }>(
      response,
    );
    setSessions(payload.sessions);
    setIsLoading(false);
    return payload.sessions;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch("/api/sessions", {
          cache: "no-store",
        });

        const payload = await parseJsonResponse<{ sessions: SessionSummaryDto[] }>(
          response,
        );

        if (!cancelled) {
          setSessions(payload.sessions);
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
  }, []);

  const create = useCallback(async () => {
    const response = await fetch("/api/sessions", {
      method: "POST",
    });

    const payload = await parseJsonResponse<{ session: SessionDetailDto }>(
      response,
    );
    setSessions((current) => [payload.session, ...current]);
    return payload.session;
  }, []);

  const remove = useCallback(async (sessionId: string) => {
    const response = await fetch(`/api/sessions/${sessionId}`, {
      method: "DELETE",
    });

    const payload = await parseJsonResponse<{ session: SessionDetailDto }>(
      response,
    );
    setSessions((current) =>
      current.filter((session) => session.id !== payload.session.id),
    );
    return payload.session;
  }, []);

  return {
    sessions,
    isLoading,
    refresh,
    create,
    remove,
    setSessions,
  };
}
