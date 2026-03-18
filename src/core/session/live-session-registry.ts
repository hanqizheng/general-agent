import type { AgentEvent } from "@/core/events/types";

interface SessionSubscriber {
  id: string;
  onEvent: (event: AgentEvent) => void;
}

interface LiveSessionEntry {
  runId: string | null;
  runPromise: Promise<void> | null;
  abortController: AbortController | null;
  subscribers: Map<string, SessionSubscriber>;
  status: "idle" | "busy" | "error";
  lastTouchedAt: number;
  abortRequested: boolean;
  gcTimer: ReturnType<typeof setTimeout> | null;
}

function getOrCreateEntry(map: Map<string, LiveSessionEntry>, sessionId: string) {
  const current = map.get(sessionId);
  if (current) {
    return current;
  }

  const created: LiveSessionEntry = {
    runId: null,
    runPromise: null,
    abortController: null,
    subscribers: new Map(),
    status: "idle",
    lastTouchedAt: Date.now(),
    abortRequested: false,
    gcTimer: null,
  };
  map.set(sessionId, created);
  return created;
}

export class LiveSessionRegistry {
  private readonly sessions = new Map<string, LiveSessionEntry>();

  subscribe(sessionId: string, onEvent: (event: AgentEvent) => void) {
    const entry = getOrCreateEntry(this.sessions, sessionId);
    const subscriberId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;

    if (entry.gcTimer) {
      clearTimeout(entry.gcTimer);
      entry.gcTimer = null;
    }

    entry.subscribers.set(subscriberId, { id: subscriberId, onEvent });
    entry.lastTouchedAt = Date.now();

    return () => {
      const current = this.sessions.get(sessionId);
      if (!current) {
        return;
      }

      current.subscribers.delete(subscriberId);
      current.lastTouchedAt = Date.now();
      this.scheduleGc(sessionId, current);
    };
  }

  attachRun(
    sessionId: string,
    runId: string,
    abortController: AbortController,
    runPromise: Promise<void>,
  ) {
    const entry = getOrCreateEntry(this.sessions, sessionId);
    entry.runId = runId;
    entry.abortController = abortController;
    entry.runPromise = runPromise;
    entry.status = "busy";
    entry.abortRequested = false;
    entry.lastTouchedAt = Date.now();
    if (entry.gcTimer) {
      clearTimeout(entry.gcTimer);
      entry.gcTimer = null;
    }
  }

  broadcast(sessionId: string, event: AgentEvent) {
    const entry = getOrCreateEntry(this.sessions, sessionId);
    entry.lastTouchedAt = Date.now();
    if (event.type === "session.status") {
      entry.status = event.status;
    }

    for (const subscriber of entry.subscribers.values()) {
      subscriber.onEvent(event);
    }
  }

  abort(sessionId: string) {
    const entry = this.sessions.get(sessionId);
    if (!entry?.abortController) {
      return false;
    }

    entry.abortRequested = true;
    entry.abortController.abort();
    entry.lastTouchedAt = Date.now();
    return true;
  }

  complete(sessionId: string) {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      return;
    }

    entry.runId = null;
    entry.runPromise = null;
    entry.abortController = null;
    entry.abortRequested = false;
    entry.lastTouchedAt = Date.now();
    this.scheduleGc(sessionId, entry);
  }

  hasActiveRun(sessionId: string) {
    return Boolean(this.sessions.get(sessionId)?.runId);
  }

  wasAbortRequested(sessionId: string) {
    return Boolean(this.sessions.get(sessionId)?.abortRequested);
  }

  getStatus(sessionId: string) {
    return this.sessions.get(sessionId)?.status ?? "idle";
  }

  private scheduleGc(sessionId: string, entry: LiveSessionEntry) {
    if (entry.runId || entry.subscribers.size > 0 || entry.gcTimer) {
      return;
    }

    entry.gcTimer = setTimeout(() => {
      const current = this.sessions.get(sessionId);
      if (!current) {
        return;
      }
      if (current.runId || current.subscribers.size > 0) {
        current.gcTimer = null;
        return;
      }
      this.sessions.delete(sessionId);
    }, 30_000);
  }
}

declare global {
  var __generalAgentLiveSessionRegistry: LiveSessionRegistry | undefined;
}

export const liveSessionRegistry =
  globalThis.__generalAgentLiveSessionRegistry ??
  (globalThis.__generalAgentLiveSessionRegistry = new LiveSessionRegistry());
