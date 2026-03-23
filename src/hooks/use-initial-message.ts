const STORAGE_KEY = "pending-initial-message";

interface PendingMessage {
  sessionId: string;
  text: string;
}

export function writePendingMessage(sessionId: string, text: string): void {
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ sessionId, text } satisfies PendingMessage),
  );
}

export function consumePendingMessage(sessionId: string): string | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed: PendingMessage = JSON.parse(raw);
    if (parsed.sessionId !== sessionId) return null;

    sessionStorage.removeItem(STORAGE_KEY);
    return parsed.text;
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}
