import type { SendMessageInput } from "@/lib/session-dto";

const STORAGE_KEY = "pending-initial-message";

interface PendingMessage extends SendMessageInput {
  sessionId: string;
}

export function writePendingMessage(
  sessionId: string,
  input: SendMessageInput,
): void {
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ sessionId, ...input } satisfies PendingMessage),
  );
}

export function consumePendingMessage(sessionId: string): SendMessageInput | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed: PendingMessage = JSON.parse(raw);
    if (parsed.sessionId !== sessionId) return null;

    sessionStorage.removeItem(STORAGE_KEY);
    return {
      text: parsed.text,
      attachments: Array.isArray(parsed.attachments) ? parsed.attachments : [],
    };
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}
