"use client";

import { useCallback, useMemo } from "react";

import { parseJsonResponse } from "@/lib/client-auth";
import type { SessionDetailDto } from "@/lib/session-dto";

export function useSession(sessionId: string) {
  const refresh = useCallback(async () => {
    const response = await fetch(`/api/sessions/${sessionId}`, {
      cache: "no-store",
    });

    const data = await parseJsonResponse<{ session: SessionDetailDto }>(
      response,
    );
    return data.session;
  }, [sessionId]);

  const abort = useCallback(async () => {
    const response = await fetch(`/api/sessions/${sessionId}/abort`, {
      method: "POST",
    });

    return parseJsonResponse<{
      sessionId: string;
      aborted: boolean;
      activeRunId: string | null;
    }>(response);
  }, [sessionId]);

  const remove = useCallback(async () => {
    const response = await fetch(`/api/sessions/${sessionId}`, {
      method: "DELETE",
    });

    return parseJsonResponse<{ session: SessionDetailDto }>(response);
  }, [sessionId]);

  return useMemo(
    () => ({
      refresh,
      abort,
      remove,
    }),
    [abort, refresh, remove],
  );
}
